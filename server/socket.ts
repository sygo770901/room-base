import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { loadPersistedRoom, savePersistedRoom } from './persist.ts'
import { ROOM_BOUNDS, type FurnitureItem } from '../shared/furniture.ts'
import type { PlayerState, SeatId, StickyNote, Vec3 } from './types.ts'

export interface RoomState {
  roomId: string
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
}

const COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b', '#e9c46a', '#2a9d8f']
const rooms = new Map<string, RoomState>()

function createRoom(roomId: string): RoomState {
  const persisted = loadPersistedRoom(roomId)
  return {
    roomId,
    hostId: null,
    players: {},
    notes: persisted.notes,
    seats: {},
    furniture: persisted.furniture,
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
    hostId: room.hostId,
    players: room.players,
    notes: room.notes,
    seats: room.seats,
    furniture: room.furniture,
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

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  })

  io.on('connection', (socket) => {
    let currentRoomId: string | null = null

    socket.on(
      'join',
      (payload: { roomId: string; name: string; wantHost?: boolean }, ack?: (data: unknown) => void) => {
        const roomId = (payload.roomId || 'home').trim().slice(0, 32) || 'home'
        const name = (payload.name || '訪客').trim().slice(0, 16) || '訪客'
        const room = getOrCreateRoom(roomId)

        if (currentRoomId) socket.leave(currentRoomId)

        const isFirst = Object.keys(room.players).length === 0
        const role: 'host' | 'guest' =
          isFirst || (payload.wantHost && !room.hostId) ? 'host' : 'guest'
        if (role === 'host') room.hostId = socket.id

        const color = COLORS[Object.keys(room.players).length % COLORS.length]
        const spawnIndex = Object.keys(room.players).length
        const player: PlayerState = {
          id: socket.id,
          name,
          color,
          position: [-4.2 + spawnIndex * 0.55, 0, 2.4],
          rotationY: Math.PI,
          seated: null,
          role,
        }

        room.players[socket.id] = player
        currentRoomId = roomId
        socket.join(roomId)

        const snapshot = publicRoom(room)
        ack?.(snapshot)
        socket.to(roomId).emit('player:joined', player)
        socket.to(roomId).emit('voice:peer-joined', { id: socket.id })
        io.to(roomId).emit('room:state', snapshot)
      },
    )

    socket.on('move', (payload: { position: Vec3; rotationY: number }) => {
      if (!currentRoomId) return
      const room = rooms.get(currentRoomId)
      if (!room) return
      const player = room.players[socket.id]
      if (!player || player.seated) return
      player.position = payload.position
      player.rotationY = payload.rotationY
      socket.to(currentRoomId).emit('player:moved', {
        id: socket.id,
        position: player.position,
        rotationY: player.rotationY,
      })
    })

    socket.on('sit', (payload: { seatId: SeatId | null }, ack?: (ok: boolean, reason?: string) => void) => {
      if (!currentRoomId) return
      const room = rooms.get(currentRoomId)
      if (!room) return
      const player = room.players[socket.id]
      if (!player) return

      if (payload.seatId === null) {
        if (player.seated) {
          room.seats[player.seated] = null
          player.seated = null
        }
        ack?.(true)
        io.to(currentRoomId).emit('room:state', publicRoom(room))
        return
      }

      const seatId = payload.seatId
      if (room.seats[seatId] && room.seats[seatId] !== socket.id) {
        ack?.(false, '座位已被佔用')
        return
      }

      if (player.seated) room.seats[player.seated] = null
      room.seats[seatId] = socket.id
      player.seated = seatId
      player.position = seatWorldPos(room, seatId)
      player.rotationY = seatId.startsWith('bed') ? 0 : Math.PI

      ack?.(true)
      io.to(currentRoomId).emit('room:state', publicRoom(room))
    })

    socket.on(
      'note:add',
      (
        payload: { text: string; position?: Vec3; color?: string; fontSize?: number },
        ack?: (note: StickyNote | null) => void,
      ) => {
        if (!currentRoomId) return
        const room = rooms.get(currentRoomId)
        if (!room) return
        const player = room.players[socket.id]
        if (!player) return

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
          authorId: socket.id,
          position: payload.position || [-4, 1.2, 1],
          color: payload.color || '#ffe566',
          fontSize,
          createdAt: Date.now(),
        }
        room.notes.push(note)
        if (room.notes.length > 60) room.notes.shift()
        persist(room)

        ack?.(note)
        io.to(currentRoomId).emit('note:added', note)
      },
    )

    socket.on('note:remove', (payload: { id: string }) => {
      if (!currentRoomId) return
      const room = rooms.get(currentRoomId)
      if (!room) return
      const player = room.players[socket.id]
      if (!player) return

      const note = room.notes.find((n) => n.id === payload.id)
      if (!note) return
      if (note.authorId !== socket.id && player.role !== 'host') return

      room.notes = room.notes.filter((n) => n.id !== payload.id)
      persist(room)
      io.to(currentRoomId).emit('note:removed', { id: payload.id })
    })

    socket.on(
      'furniture:move',
      (
        payload: { id: string; position: Vec3; rotationY?: number },
        ack?: (ok: boolean, reason?: string) => void,
      ) => {
        if (!currentRoomId) return
        const room = rooms.get(currentRoomId)
        if (!room) return
        const player = room.players[socket.id]
        if (!player) {
          ack?.(false, '尚未加入房間')
          return
        }

        const item = room.furniture.find((f) => f.id === payload.id)
        if (!item || !item.draggable) {
          ack?.(false, '此物件不可移動')
          return
        }

        item.position = clampFurniturePos(item, payload.position)
        if (typeof payload.rotationY === 'number') item.rotationY = payload.rotationY
        persist(room)
        ack?.(true)
        io.to(currentRoomId).emit('furniture:updated', {
          id: item.id,
          position: item.position,
          rotationY: item.rotationY,
        })
      },
    )

    /** 任何人走路推動家具 */
    socket.on('furniture:push', (payload: { id: string; position: Vec3 }) => {
      if (!currentRoomId) return
      const room = rooms.get(currentRoomId)
      if (!room) return
      if (!room.players[socket.id]) return

      const item = room.furniture.find((f) => f.id === payload.id)
      if (!item || !item.pushable) return

      item.position = clampFurniturePos(item, payload.position)
      persist(room)
      io.to(currentRoomId).emit('furniture:updated', {
        id: item.id,
        position: item.position,
        rotationY: item.rotationY,
      })
    })

    socket.on('voice:signal', (payload: { to: string; data: unknown }) => {
      if (!currentRoomId || !payload?.to) return
      io.to(payload.to).emit('voice:signal', { from: socket.id, data: payload.data })
    })

    socket.on('disconnect', () => {
      if (!currentRoomId) return
      const room = rooms.get(currentRoomId)
      if (!room) return

      const player = room.players[socket.id]
      if (player?.seated) room.seats[player.seated] = null
      delete room.players[socket.id]

      if (room.hostId === socket.id) {
        const next = Object.values(room.players)[0]
        room.hostId = next?.id ?? null
        if (next) next.role = 'host'
      }

      persist(room)

      socket.to(currentRoomId).emit('player:left', { id: socket.id })
      socket.to(currentRoomId).emit('voice:peer-left', { id: socket.id })
      io.to(currentRoomId).emit('room:state', publicRoom(room))

      if (Object.keys(room.players).length === 0) {
        rooms.delete(currentRoomId)
      }
    })
  })

  return io
}
