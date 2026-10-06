import { io, Socket } from 'socket.io-client'
import type { FurnitureItem } from '../../shared/furniture'
import type { PlayerState, RoomSnapshot, SeatId, StickyNote, Vec3 } from '../types'
import { useAppStore } from '../store'
import { startVoiceSession, stopVoiceSession } from './voice'

let socket: Socket | null = null

export function getSocket() {
  return socket
}

export function connectSocket() {
  if (socket?.connected) return socket
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  })

  socket.on('room:state', (snapshot: RoomSnapshot) => {
    useAppStore.getState().applySnapshot(snapshot)
  })

  socket.on('player:joined', (player: PlayerState) => {
    useAppStore.getState().upsertPlayer(player)
  })

  socket.on('player:left', ({ id }: { id: string }) => {
    useAppStore.getState().removePlayer(id)
  })

  socket.on('player:moved', (payload: { id: string; position: Vec3; rotationY: number }) => {
    useAppStore.getState().patchPlayer(payload.id, {
      position: payload.position,
      rotationY: payload.rotationY,
    })
  })

  socket.on('note:added', (note: StickyNote) => {
    useAppStore.getState().addNote(note)
  })

  socket.on('note:removed', ({ id }: { id: string }) => {
    useAppStore.getState().removeNote(id)
  })

  socket.on(
    'furniture:updated',
    (payload: { id: string; position: Vec3; rotationY: number }) => {
      useAppStore.getState().patchFurniture(payload.id, {
        position: payload.position,
        rotationY: payload.rotationY,
      })
    },
  )

  return socket
}

export function joinRoom(roomId: string, name: string, wantHost = false) {
  const s = connectSocket()
  return new Promise<RoomSnapshot>((resolve, reject) => {
    s.emit('join', { roomId, name, wantHost }, (snapshot: RoomSnapshot) => {
      if (!snapshot) {
        reject(new Error('加入失敗'))
        return
      }
      useAppStore.getState().enterRoom(s.id!, snapshot)
      const peers = Object.keys(snapshot.players).filter((id) => id !== s.id)
      startVoiceSession(s.id!, peers)
      resolve(snapshot)
    })
  })
}

export function emitMove(position: Vec3, rotationY: number) {
  socket?.emit('move', { position, rotationY })
}

export function emitSit(seatId: SeatId | null) {
  return new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    socket?.emit('sit', { seatId }, (ok: boolean, reason?: string) => {
      resolve({ ok, reason })
    })
  })
}

export function emitAddNote(text: string, position?: Vec3) {
  return new Promise<StickyNote | null>((resolve) => {
    socket?.emit('note:add', { text, position }, (note: StickyNote | null) => {
      resolve(note)
    })
  })
}

export function emitRemoveNote(id: string) {
  socket?.emit('note:remove', { id })
}

export function emitFurnitureMove(id: string, position: Vec3, rotationY?: number) {
  return new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    socket?.emit('furniture:move', { id, position, rotationY }, (ok: boolean, reason?: string) => {
      resolve({ ok, reason })
    })
  })
}

export function disconnectSocket() {
  stopVoiceSession()
  socket?.disconnect()
  socket = null
  useAppStore.getState().leaveToLobby()
}

export type { FurnitureItem }
