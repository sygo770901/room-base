import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { BOSS_COUNTDOWN_MS, PLAYER_MAX_HP, ROOM_MAX_PLAYERS, type ProjectileState } from '../shared/combat.ts'
import { SPAWN_POINTS } from '../shared/dungeon.ts'
import { ROOM_BOUNDS, type FurnitureItem } from '../shared/furniture.ts'
import { createBossMonsters, createMonsters, handleAttack, publicMonsters, scaleBossHealth, tickRoom } from './combat.ts'
import {
  acceptMove,
  emitPlayerHidden,
  emitPlayerJoined,
  emitPlayerMoved,
  handleCheck,
  maybeRerollGhosts,
  playersForViewer,
  resetPlayersForTagRestart,
  settleTag,
  startTagRound,
  tagHudFor,
  tryHide,
  type TagState,
} from './tag.ts'
import { loadPersistedRoom, savePersistedRoom } from './persist.ts'
import { PLAYER_CLASS } from '../shared/classes.ts'
import {
  DASH_DURATION_MS,
  DASH_IFRAME_MS,
  JUMP_AIR_MS,
  dashCooldownMs,
  type MoveGrant,
} from '../shared/movement.ts'
import {
  SMOKE_DURATION_MS,
  SMOKE_RADIUS,
  SMOKE_RANGE,
  liveSmokes,
  smokeCooldownMs,
  type SmokeCloud,
} from '../shared/smoke.ts'
import { createBarrels, type BarrelState, type LootDrop } from '../shared/barrels.ts'
import {
  DOOR_ANIM_MS,
  DOOR_RANGE,
  createDoors,
  doorDef,
  nearestDoor,
  occupantInDoor,
  type DoorState,
} from '../shared/doors.ts'
import { defaultSettings, isGameMode, type GameMode, type RoomSettings } from '../shared/modes.ts'
import { isSceneId, type SceneId } from '../shared/scenes.ts'
import type { MatchOver } from '../shared/combat.ts'
import type { PlayerState, SeatId, StickyNote, Vec3 } from './types.ts'

export interface RoomState {
  roomId: string
  scene: SceneId
  mode: GameMode
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
  monsters: ReturnType<typeof createMonsters>
  hurtUntil: Record<string, number>
  nextAttack: Record<string, number>
  matchOver: MatchOver | null
  awayUntil: Record<string, number>
  damage: Record<string, { name: string; dmg: number }>
  settings: RoomSettings
  matchDeadline: number | null
  startAt: number
  hpScaled: boolean
  started: boolean
  tag?: TagState
  lastMoveAt: Record<string, number>
  moveGrant: Record<string, MoveGrant>
  nextDash: Record<string, number>
  nextSmoke: Record<string, number>
  smokes: SmokeCloud[]
  barrels: BarrelState[]
  drops: LootDrop[]
  projectiles: ProjectileState[]
  doors: DoorState[]
}

const COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b', '#e9c46a', '#2a9d8f']
const RECONNECT_GRACE_MS = 30_000
const rooms = new Map<string, RoomState>()
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const playerSockets = new Map<string, string>()

function createRoom(roomId: string): RoomState {
  const persisted = loadPersistedRoom(roomId)
  return {
    roomId,
    scene: 'kenney',
    mode: 'hunt',
    hostId: null,
    players: {},
    notes: persisted.notes,
    seats: {},
    furniture: persisted.furniture,
    monsters: createMonsters(),
    hurtUntil: {},
    nextAttack: {},
    matchOver: null,
    awayUntil: {},
    damage: {},
    settings: defaultSettings(),
    matchDeadline: null,
    startAt: 0,
    hpScaled: false,
    started: false,
    lastMoveAt: {},
    moveGrant: {},
    nextDash: {},
    nextSmoke: {},
    smokes: [],
    barrels: createBarrels(),
    drops: [],
    projectiles: [],
    doors: createDoors(),
  }
}

function getOrCreateRoom(roomId: string) {
  let room = rooms.get(roomId)
  if (!room) {
    room = createRoom(roomId)
    rooms.set(roomId, room)
  }
  return room
}

function persist(room: RoomState) {
  savePersistedRoom(room.roomId, { notes: room.notes, furniture: room.furniture })
}

function snapshotFor(room: RoomState, viewerId: string) {
  return {
    roomId: room.roomId,
    scene: room.scene,
    mode: room.mode,
    hostId: room.hostId,
    players: playersForViewer(room, viewerId),
    notes: room.notes,
    seats: room.seats,
    furniture: room.furniture,
    monsters: publicMonsters(room.monsters),
    matchOver: room.matchOver,
    settings: room.settings,
    timeLeftMs: room.matchDeadline ? Math.max(0, room.matchDeadline - Date.now()) : null,
    startInMs: room.startAt ? Math.max(0, room.startAt - Date.now()) : 0,
    started: room.started,
    tagHud: tagHudFor(room, viewerId),
    smokes: liveSmokes(room.smokes, Date.now()),
    barrels: room.barrels,
    drops: room.drops,
    projectiles: room.projectiles,
    doors: room.doors,
  }
}

function emitState(room: RoomState, io: Server) {
  for (const id of Object.keys(room.players)) {
    io.to(id).emit('room:state', snapshotFor(room, id))
  }
}

function seatWorldPos(room: RoomState, seatId: SeatId): Vec3 {
  const item = room.furniture.find((f) => f.seat === seatId)
  if (!item) return [0, 0.4, 0]
  if (seatId.startsWith('bed')) return [item.position[0], 0.4, item.position[2] + 0.2]
  return [item.position[0], 0.4, item.position[2]]
}

function clampFurniturePos(item: FurnitureItem, pos: Vec3): Vec3 {
  const hx = item.collider?.[0] ?? 0.2
  const hz = item.collider?.[1] ?? 0.2
  return [
    Math.max(ROOM_BOUNDS.minX + hx, Math.min(ROOM_BOUNDS.maxX - hx, pos[0])),
    item.position[1],
    Math.max(ROOM_BOUNDS.minZ + hz, Math.min(ROOM_BOUNDS.maxZ - hz, pos[2])),
  ]
}

function normalizePlayerId(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') return fallback
  const id = raw.trim().slice(0, 64)
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return fallback
  return id
}

function leaveKey(roomId: string, playerId: string) {
  return `${roomId}:${playerId}`
}

function cancelLeave(room: RoomState, playerId: string) {
  const key = leaveKey(room.roomId, playerId)
  const timer = leaveTimers.get(key)
  if (timer) clearTimeout(timer)
  leaveTimers.delete(key)
  delete room.awayUntil[playerId]
}

function playerIdOf(socket: Socket) {
  return typeof socket.data.playerId === 'string' ? (socket.data.playerId as string) : null
}

function inRoom(socket: Socket, currentRoomId: string | null) {
  if (!currentRoomId) return null
  const room = rooms.get(currentRoomId)
  const playerId = playerIdOf(socket)
  if (!room || !playerId) return null
  const player = room.players[playerId]
  if (!player) return null
  return { room, player, playerId }
}

function applyResume(
  player: PlayerState,
  resume:
    | {
        position?: Vec3
        rotationY?: number
        hidden?: boolean
        seated?: SeatId | null
      }
    | undefined,
) {
  if (!resume) return
  if (
    !player.hidden &&
    Array.isArray(resume.position) &&
    resume.position.length >= 3 &&
    resume.position.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    player.position = [resume.position[0], 0, resume.position[2]]
  }
  if (typeof resume.rotationY === 'number' && Number.isFinite(resume.rotationY)) {
    player.rotationY = resume.rotationY
  }
}

function removeFromOtherRooms(playerId: string, keepRoomId: string, io: Server) {
  for (const room of [...rooms.values()]) {
    if (room.roomId === keepRoomId) continue
    if (room.players[playerId]) removePlayer(room, playerId, io)
  }
}

function removePlayer(room: RoomState, playerId: string, io: Server) {
  const player = room.players[playerId]
  if (!player) return
  cancelLeave(room, playerId)
  if (player.seated) room.seats[player.seated] = null
  delete room.players[playerId]
  delete room.hurtUntil[playerId]
  delete room.nextAttack[playerId]
  delete room.lastMoveAt[playerId]
  delete room.moveGrant[playerId]
  delete room.nextDash[playerId]
  delete room.nextSmoke[playerId]
  playerSockets.delete(playerId)

  if (room.hostId === playerId) {
    const next = Object.values(room.players)[0]
    room.hostId = next?.id ?? null
    if (next) next.role = 'host'
  }

  persist(room)
  io.to(room.roomId).emit('player:left', { id: playerId })
  io.to(room.roomId).emit('voice:peer-left', { id: playerId })
  maybeRerollGhosts(room, io, Date.now())
  settleTag(room, io, Date.now())
  emitState(room, io)

  if (Object.keys(room.players).length === 0) {
    rooms.delete(room.roomId)
  }
}

function scheduleLeave(room: RoomState, playerId: string, io: Server) {
  cancelLeave(room, playerId)
  room.awayUntil[playerId] = Date.now() + RECONNECT_GRACE_MS
  const key = leaveKey(room.roomId, playerId)
  leaveTimers.set(
    key,
    setTimeout(() => {
      leaveTimers.delete(key)
      const current = rooms.get(room.roomId)
      if (!current?.players[playerId] || !current.awayUntil[playerId]) return
      removePlayer(current, playerId, io)
    }, RECONNECT_GRACE_MS),
  )
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  io.on('connection', (socket) => {
    let currentRoomId: string | null = null

    socket.on(
      'join',
      (
        payload: {
          roomId: string
          name: string
          wantHost?: boolean
          scene?: string
          mode?: string
          playerId?: string
          timed?: boolean
          resume?: {
            position?: Vec3
            rotationY?: number
            hidden?: boolean
            seated?: SeatId | null
          }
        },
        ack?: (data: unknown) => void,
      ) => {
        const roomId = (payload.roomId || 'home').trim().slice(0, 32) || 'home'
        const name = (payload.name || '訪客').trim().slice(0, 16) || '訪客'
        const playerId = normalizePlayerId(payload.playerId ?? socket.handshake.auth?.playerId, socket.id)
        const room = getOrCreateRoom(roomId)
        const existing = room.players[playerId]
        if (!existing && Object.keys(room.players).length >= ROOM_MAX_PLAYERS) {
          ack?.({ error: '房間已滿' })
          return
        }
        const sameSocket = existing && playerSockets.get(playerId) === socket.id && currentRoomId === roomId

        if (sameSocket && !room.awayUntil[playerId]) {
          ack?.(snapshotFor(room, playerId))
          return
        }

        if (currentRoomId && currentRoomId !== roomId) {
          socket.leave(currentRoomId)
          socket.leave(playerIdOf(socket) ?? '')
        }

        socket.data.playerId = playerId
        socket.data.replaced = false

        removeFromOtherRooms(playerId, roomId, io)

        const prevSid = playerSockets.get(playerId)
        if (prevSid && prevSid !== socket.id) {
          const prev = io.sockets.sockets.get(prevSid)
          if (prev) {
            prev.data.replaced = true
            const prevRoomId = typeof prev.data.roomId === 'string' ? prev.data.roomId : null
            if (prevRoomId && prevRoomId !== roomId) {
              const prevRoom = rooms.get(prevRoomId)
              if (prevRoom?.players[playerId]) removePlayer(prevRoom, playerId, io)
            }
            io.to(prevRoomId || roomId).emit('voice:peer-left', { id: playerId })
            prev.disconnect(true)
          }
        }

        const isFirst = Object.keys(room.players).length === 0
        if (isFirst && isSceneId(payload.scene)) room.scene = payload.scene
        if (isFirst && !isGameMode(payload.mode)) room.started = true
        if (isFirst && isGameMode(payload.mode)) {
          room.mode = payload.mode
          room.monsters =
            payload.mode === 'boss' ? createBossMonsters() : payload.mode === 'tag' ? [] : createMonsters()
          room.matchOver = null
          room.damage = {}
          room.projectiles = []
          room.doors = createDoors()
          const allowTimed = payload.mode === 'boss' || payload.mode === 'tag'
          room.settings = {
            timed: Boolean(payload.timed) && allowTimed,
            timeLimitSec: payload.timed && allowTimed ? 300 : 0,
          }
          if (payload.mode === 'boss' || payload.mode === 'tag') {
            room.started = false
            room.startAt = 0
            room.hpScaled = false
            room.matchDeadline = null
          } else {
            room.started = true
            room.startAt = 0
            room.matchDeadline = null
          }
        }

        let player = existing
        let resumed = Boolean(existing)
        if (!player) {
          const role: 'host' | 'guest' =
            isFirst || (payload.wantHost && !room.hostId) ? 'host' : 'guest'
          if (role === 'host') room.hostId = playerId
          const color = COLORS[Object.keys(room.players).length % COLORS.length]
          const spawnIndex = Object.keys(room.players).length
          const sp = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length]
          player = {
            id: playerId,
            name,
            color,
            classId: PLAYER_CLASS,
            position: [sp.x, 0, sp.z],
            rotationY: 0,
            seated: null,
            role,
            hp: PLAYER_MAX_HP,
            hidden: false,
            team:
              room.started && !room.matchOver && (room.mode === 'tag' || room.mode === 'boss')
                ? 'spectator'
                : room.mode === 'tag' || room.mode === 'boss'
                  ? 'hider'
                  : undefined,
          }
          room.players[playerId] = player
          resumed = false
        } else {
          applyResume(player, payload.resume)
        }
        room.lastMoveAt[playerId] = Date.now()

        cancelLeave(room, playerId)
        playerSockets.set(playerId, socket.id)
        currentRoomId = roomId
        socket.data.roomId = roomId
        socket.join(roomId)
        socket.join(playerId)

        ack?.(snapshotFor(room, playerId))
        if (!resumed) emitPlayerJoined(room, io, player)
        socket.to(roomId).emit('voice:peer-joined', { id: playerId })
        emitState(room, io)
      },
    )

    socket.on('match:restart', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, playerId } = ctx
      if (room.hostId !== playerId) return
      if (!room.matchOver) return
      if (room.mode !== 'boss' && room.mode !== 'tag') return
      room.matchOver = null
      room.started = false
      room.hurtUntil = {}
      room.nextAttack = {}
      room.damage = {}
      room.startAt = 0
      room.matchDeadline = null
      if (room.mode === 'boss') {
        room.monsters = createBossMonsters()
        room.hpScaled = false
      } else {
        room.monsters = []
        resetPlayersForTagRestart(room)
        room.tag = undefined
      }
      room.smokes = []
      room.barrels = createBarrels()
      room.drops = []
      room.projectiles = []
      room.doors = createDoors()
      const ids = Object.keys(room.players)
      ids.forEach((id, i) => {
        const p = room.players[id]
        const sp = SPAWN_POINTS[i % SPAWN_POINTS.length]
        p.hp = PLAYER_MAX_HP
        p.hidden = false
        p.weapon = 'sword'
        p.weaponUntil = 0
        if (p.seated) {
          room.seats[p.seated] = null
          p.seated = null
        }
        if (room.mode !== 'tag') {
          p.position = [sp.x, 0, sp.z]
          p.rotationY = 0
        }
        room.lastMoveAt[id] = Date.now()
        delete room.moveGrant[id]
        delete room.nextDash[id]
        delete room.nextSmoke[id]
        io.to(id).emit('player:respawn', {
          position: p.position,
          hp: p.hp,
          rotationY: p.rotationY,
          reason: 'restart',
        })
      })
      emitState(room, io)
    })

    socket.on('match:start', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, playerId } = ctx
      if (room.hostId !== playerId) return
      if (room.matchOver || room.started) return
      if (room.mode !== 'boss' && room.mode !== 'tag') return
      const present = Object.values(room.players).filter((p) => !room.awayUntil[p.id])
      if (room.mode === 'tag') {
        if (present.length < 2) return
        for (const p of present) p.team = 'hider'
        if (!startTagRound(room, io, Date.now())) return
      } else {
        room.started = true
        room.hpScaled = false
        room.startAt = Date.now() + BOSS_COUNTDOWN_MS
        room.matchDeadline = room.settings.timed ? room.startAt + room.settings.timeLimitSec * 1000 : null
        scaleBossHealth(room)
      }
      emitState(room, io)
    })

    socket.on('leave', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      removePlayer(ctx.room, ctx.playerId, io)
      socket.leave(ctx.room.roomId)
      socket.leave(ctx.playerId)
      currentRoomId = null
      socket.data.playerId = undefined
    })

    socket.on('move', (payload: { position: Vec3; rotationY: number }) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx
      if (player.seated) return
      const now = Date.now()
      if (player.hidden) return
      const ok = acceptMove(room, player, payload, now)
      if (!ok) {
        io.to(playerId).emit('player:moved', {
          id: playerId,
          position: player.position,
          rotationY: player.rotationY,
          snap: true,
        })
        return
      }
      emitPlayerMoved(room, io, playerId)
    })

    socket.on('dash', (payload: { dirX?: number; dirZ?: number } = {}) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx
      const now = Date.now()
      if (player.seated || player.hidden) return
      if (player.team === 'spectator') return
      if ((room.mode === 'boss' || room.mode === 'tag') && !room.started) return
      if (room.mode === 'tag' && player.team === 'ghost' && room.tag && now < room.tag.hideUntil) {
        io.to(playerId).emit('dash:result', { ok: false, nextAt: room.tag.hideUntil, reason: 'hide' })
        return
      }
      const readyAt = room.nextDash[playerId] ?? 0
      if (now < readyAt) {
        io.to(playerId).emit('dash:result', { ok: false, nextAt: readyAt, reason: 'cd' })
        return
      }
      let dx = typeof payload.dirX === 'number' && Number.isFinite(payload.dirX) ? payload.dirX : 0
      let dz = typeof payload.dirZ === 'number' && Number.isFinite(payload.dirZ) ? payload.dirZ : 0
      const len = Math.hypot(dx, dz)
      if (len < 1e-3) {
        dx = Math.sin(player.rotationY)
        dz = Math.cos(player.rotationY)
      } else {
        dx /= len
        dz /= len
      }
      const until = now + DASH_DURATION_MS
      const nextAt = now + dashCooldownMs(player.team)
      room.nextDash[playerId] = nextAt
      room.moveGrant[playerId] = { ...room.moveGrant[playerId], dashUntil: until }
      room.hurtUntil[playerId] = Math.max(room.hurtUntil[playerId] ?? 0, now + DASH_IFRAME_MS)
      io.to(room.roomId).emit('player:dash', { id: playerId, until, dirX: dx, dirZ: dz })
      io.to(playerId).emit('dash:result', { ok: true, nextAt, until })
    })

    socket.on('door:toggle', (payload: { id?: string } = {}) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx
      if (player.seated || player.team === 'spectator') return
      const now = Date.now()
      const near =
        (typeof payload.id === 'string' && doorDef(payload.id)
          ? doorDef(payload.id)
          : nearestDoor(player.position[0], player.position[2], DOOR_RANGE)) ?? null
      if (!near) return
      if (Math.hypot(near.x - player.position[0], near.z - player.position[2]) > DOOR_RANGE) return
      const door = room.doors.find((d) => d.id === near.id)
      if (!door || now < door.busyUntil) return
      if (door.open) {
        for (const p of Object.values(room.players)) {
          if (room.awayUntil[p.id] || p.team === 'spectator') continue
          if (occupantInDoor(near, p.position[0], p.position[2])) {
            io.to(playerId).emit('door:result', { ok: false, reason: 'blocked' })
            return
          }
        }
      }
      door.open = !door.open
      door.busyUntil = now + DOOR_ANIM_MS
      io.to(room.roomId).emit('doors:sync', room.doors)
      if (room.mode === 'tag') {
        for (const id of Object.keys(room.players)) emitPlayerMoved(room, io, id)
      }
    })

    socket.on('jump', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx
      if (player.seated || player.hidden || player.team === 'spectator') return
      const now = Date.now()
      room.moveGrant[playerId] = { ...room.moveGrant[playerId], jumpUntil: now + JUMP_AIR_MS }
    })

    socket.on('skill:smoke', (payload: { x?: number; z?: number } = {}) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx
      const now = Date.now()
      if (player.seated || player.hidden) return
      if (player.team === 'spectator') return
      if ((room.mode === 'boss' || room.mode === 'tag') && !room.started) return
      const readyAt = room.nextSmoke[playerId] ?? 0
      if (now < readyAt) {
        io.to(playerId).emit('smoke:result', { ok: false, nextAt: readyAt })
        return
      }
      const ox = player.position[0]
      const oz = player.position[2]
      let tx = typeof payload.x === 'number' && Number.isFinite(payload.x) ? payload.x : ox + Math.sin(player.rotationY) * SMOKE_RANGE
      let tz = typeof payload.z === 'number' && Number.isFinite(payload.z) ? payload.z : oz + Math.cos(player.rotationY) * SMOKE_RANGE
      const dx = tx - ox
      const dz = tz - oz
      const dist = Math.hypot(dx, dz)
      if (dist > SMOKE_RANGE && dist > 0) {
        tx = ox + (dx / dist) * SMOKE_RANGE
        tz = oz + (dz / dist) * SMOKE_RANGE
      }
      const cloud: SmokeCloud = {
        id: `smoke-${now}-${playerId.slice(0, 6)}`,
        x: tx,
        z: tz,
        r: SMOKE_RADIUS,
        until: now + SMOKE_DURATION_MS,
      }
      room.smokes.push(cloud)
      room.nextSmoke[playerId] = now + smokeCooldownMs(player.team)
      io.to(room.roomId).emit('smoke:sync', liveSmokes(room.smokes, now))
      io.to(playerId).emit('smoke:result', { ok: true, nextAt: room.nextSmoke[playerId] })
      emitState(room, io)
    })

    socket.on('sit', (payload: { seatId: SeatId | null }, ack?: (ok: boolean, reason?: string) => void) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx

      if (payload.seatId === null) {
        if (player.seated) {
          room.seats[player.seated] = null
          player.seated = null
        }
        ack?.(true)
        emitState(room, io)
        return
      }

      const seatId = payload.seatId
      if (room.seats[seatId] && room.seats[seatId] !== playerId) {
        ack?.(false, '座位已被佔用')
        return
      }

      if (player.seated) room.seats[player.seated] = null
      room.seats[seatId] = playerId
      player.seated = seatId
      player.position = seatWorldPos(room, seatId)
      player.rotationY = seatId.startsWith('bed') ? 0 : Math.PI

      ack?.(true)
      emitState(room, io)
    })

    socket.on(
      'note:add',
      (
        payload: { text: string; position?: Vec3; color?: string; fontSize?: number },
        ack?: (note: StickyNote | null) => void,
      ) => {
        const ctx = inRoom(socket, currentRoomId)
        if (!ctx) return
        const { room, player, playerId } = ctx

        const text = (payload.text || '').trim().slice(0, 80)
        if (!text) {
          ack?.(null)
          return
        }

        const fontSize = Math.max(0.06, Math.min(0.4, payload.fontSize ?? 0.12))
        const note: StickyNote = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          author: player.name,
          authorId: playerId,
          position: payload.position || [-4, 1.2, 1],
          color: payload.color || '#ffe566',
          fontSize,
          createdAt: Date.now(),
        }
        room.notes.push(note)
        if (room.notes.length > 60) room.notes.shift()
        persist(room)

        ack?.(note)
        io.to(currentRoomId!).emit('note:added', note)
      },
    )

    socket.on('note:update', (payload: { id: string; text: string; fontSize?: number }) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, playerId } = ctx
      const note = room.notes.find((n) => n.id === payload.id)
      if (!note || note.authorId !== playerId) return
      const text = (payload.text || '').trim().slice(0, 80)
      if (!text) return
      note.text = text
      if (typeof payload.fontSize === 'number') note.fontSize = Math.max(0.06, Math.min(0.4, payload.fontSize))
      persist(room)
      io.to(currentRoomId!).emit('note:updated', note)
    })

    socket.on('note:remove', (payload: { id: string }) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, player, playerId } = ctx

      const note = room.notes.find((n) => n.id === payload.id)
      if (!note) return
      if (note.authorId !== playerId && player.role !== 'host') return

      room.notes = room.notes.filter((n) => n.id !== payload.id)
      persist(room)
      io.to(currentRoomId!).emit('note:removed', { id: payload.id })
    })

    socket.on(
      'furniture:move',
      (
        payload: { id: string; position: Vec3; rotationY?: number },
        ack?: (ok: boolean, reason?: string) => void,
      ) => {
        const ctx = inRoom(socket, currentRoomId)
        if (!ctx) {
          ack?.(false, '尚未加入房間')
          return
        }
        const { room } = ctx

        const item = room.furniture.find((f) => f.id === payload.id)
        if (!item || !item.draggable) {
          ack?.(false, '此物件不可移動')
          return
        }

        item.position = clampFurniturePos(item, payload.position)
        if (typeof payload.rotationY === 'number') item.rotationY = payload.rotationY
        persist(room)
        ack?.(true)
        io.to(currentRoomId!).emit('furniture:updated', {
          id: item.id,
          position: item.position,
          rotationY: item.rotationY,
        })
      },
    )

    socket.on('furniture:push', (payload: { id: string; position: Vec3 }) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room } = ctx

      const item = room.furniture.find((f) => f.id === payload.id)
      if (!item || !item.pushable) return

      item.position = clampFurniturePos(item, payload.position)
      persist(room)
      io.to(currentRoomId!).emit('furniture:updated', {
        id: item.id,
        position: item.position,
        rotationY: item.rotationY,
      })
    })

    socket.on('hide', (payload: { hidden: boolean }) => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      const { room, playerId } = ctx
      if (!tryHide(room, playerId, !!payload?.hidden, Date.now())) return
      emitPlayerHidden(room, io, playerId)
    })

    socket.on('check', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      handleCheck(ctx.room, io, ctx.playerId, Date.now())
      io.to(ctx.playerId).emit('room:state', snapshotFor(ctx.room, ctx.playerId))
    })

    socket.on('attack', () => {
      const ctx = inRoom(socket, currentRoomId)
      if (!ctx) return
      handleAttack(ctx.room, ctx.playerId, io, Date.now(), socket.id)
    })

    socket.on('voice:signal', (payload: { to: string; data: unknown }) => {
      const from = playerIdOf(socket)
      if (!currentRoomId || !payload?.to || !from) return
      io.to(payload.to).emit('voice:signal', { from, data: payload.data })
    })

    socket.on('disconnect', () => {
      const playerId = playerIdOf(socket)
      const roomId = currentRoomId || (typeof socket.data.roomId === 'string' ? socket.data.roomId : null)
      if (socket.data.replaced) {
        if (playerId && roomId && playerSockets.get(playerId) !== socket.id) {
          const room = rooms.get(roomId)
          const ownerSid = playerSockets.get(playerId)
          const owner = ownerSid ? io.sockets.sockets.get(ownerSid) : undefined
          const ownerRoom = typeof owner?.data.roomId === 'string' ? owner.data.roomId : null
          if (room?.players[playerId] && ownerRoom !== room.roomId) {
            removePlayer(room, playerId, io)
          }
        }
        currentRoomId = null
        return
      }
      const ctx = inRoom(socket, roomId)
      if (!ctx) return
      const { room } = ctx
      if (playerId && playerSockets.get(playerId) === socket.id) playerSockets.delete(playerId)
      io.to(room.roomId).emit('voice:peer-left', { id: ctx.playerId })
      scheduleLeave(room, ctx.playerId, io)
      maybeRerollGhosts(room, io, Date.now())
      settleTag(room, io, Date.now())
      emitState(room, io)
      currentRoomId = null
    })
  })

  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (Object.keys(room.players).length === 0) continue
      tickRoom(room, io, now, 0.1)
    }
  }, 100)

  return io
}
