import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { PLAYER_MAX_HP } from '../shared/combat.ts'
import { HIDE_RANGE, HIDE_SPOTS, SPAWN_POINTS } from '../shared/dungeon.ts'
import { ROOM_BOUNDS, type FurnitureItem } from '../shared/furniture.ts'
import { createBossMonsters, createMonsters, handleAttack, publicMonsters, tickRoom } from './combat.ts'
import { loadPersistedRoom, savePersistedRoom } from './persist.ts'
import { PLAYER_CLASS } from '../shared/classes.ts'
import { isGameMode, type GameMode } from '../shared/modes.ts'
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

function publicRoom(room: RoomState) {
  return {
    roomId: room.roomId,
    scene: room.scene,
    mode: room.mode,
    hostId: room.hostId,
    players: room.players,
    notes: room.notes,
    seats: room.seats,
    furniture: room.furniture,
    monsters: publicMonsters(room.monsters),
    matchOver: room.matchOver,
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
    Array.isArray(resume.position) &&
    resume.position.length >= 3 &&
    resume.position.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    player.position = [resume.position[0], 0, resume.position[2]]
  }
  if (typeof resume.rotationY === 'number' && Number.isFinite(resume.rotationY)) {
    player.rotationY = resume.rotationY
  }
  if (typeof resume.hidden === 'boolean') player.hidden = resume.hidden
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
  playerSockets.delete(playerId)

  if (room.hostId === playerId) {
    const next = Object.values(room.players)[0]
    room.hostId = next?.id ?? null
    if (next) next.role = 'host'
  }

  persist(room)
  io.to(room.roomId).emit('player:left', { id: playerId })
  io.to(room.roomId).emit('voice:peer-left', { id: playerId })
  io.to(room.roomId).emit('room:state', publicRoom(room))

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
        const sameSocket = existing && playerSockets.get(playerId) === socket.id && currentRoomId === roomId

        if (sameSocket && !room.awayUntil[playerId]) {
          ack?.(publicRoom(room))
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
        if (isFirst && isGameMode(payload.mode)) {
          room.mode = payload.mode
          room.monsters = payload.mode === 'boss' ? createBossMonsters() : createMonsters()
          room.matchOver = null
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
          }
          room.players[playerId] = player
          resumed = false
        } else {
          applyResume(player, payload.resume)
        }

        cancelLeave(room, playerId)
        playerSockets.set(playerId, socket.id)
        currentRoomId = roomId
        socket.data.roomId = roomId
        socket.join(roomId)
        socket.join(playerId)

        const snapshot = publicRoom(room)
        ack?.(snapshot)
        if (!resumed) {
          socket.to(roomId).emit('player:joined', player)
        }
        socket.to(roomId).emit('voice:peer-joined', { id: playerId })
        io.to(roomId).emit('room:state', snapshot)
      },
    )

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
      if (player.hidden) {
        const moved = Math.hypot(payload.position[0] - player.position[0], payload.position[2] - player.position[2])
        if (moved > 0.2) {
          player.hidden = false
          io.to(currentRoomId!).emit('player:hidden', { id: playerId, hidden: false })
        }
      }
      player.position = payload.position
      player.rotationY = payload.rotationY
      socket.to(currentRoomId!).emit('player:moved', {
        id: playerId,
        position: player.position,
        rotationY: player.rotationY,
      })
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
        io.to(currentRoomId!).emit('room:state', publicRoom(room))
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
      io.to(currentRoomId!).emit('room:state', publicRoom(room))
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
      const { player, playerId } = ctx
      const want = !!payload?.hidden
      if (want) {
        const near = HIDE_SPOTS.some(
          (s) => Math.hypot(s.x - player.position[0], s.z - player.position[2]) <= HIDE_RANGE,
        )
        if (!near) return
      }
      player.hidden = want
      io.to(currentRoomId!).emit('player:hidden', { id: playerId, hidden: want })
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
