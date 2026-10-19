import { io, Socket } from 'socket.io-client'
import { ATTACK_COOLDOWN_MS } from '../../shared/combat'
import type { FurnitureItem } from '../../shared/furniture'
import { attackBlocked } from '../scene/inputLock'
import type { MonsterState, PlayerState, RoomSnapshot, SeatId, StickyNote, Vec3 } from '../types'
import type { MatchOver } from '../../shared/combat'
import type { GameMode } from '../../shared/modes'
import type { SceneId } from '../../shared/scenes'
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

  socket.on('player:vitals', ({ id, hp }: { id: string; hp: number }) => {
    useAppStore.getState().patchPlayer(id, { hp })
  })

  socket.on('player:respawn', (payload: { position: Vec3; hp: number; rotationY: number }) => {
    const selfId = useAppStore.getState().selfId
    if (!selfId) return
    useAppStore.getState().patchPlayer(selfId, {
      position: payload.position,
      rotationY: payload.rotationY,
      hp: payload.hp,
      seated: null,
    })
    useAppStore.getState().bumpRespawn()
    useAppStore.getState().setToast('你被打倒了，已送回入口')
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  socket.on('monsters:sync', (monsters: MonsterState[]) => {
    useAppStore.getState().setMonsters(monsters)
  })

  socket.on('match:over', (over: MatchOver) => {
    useAppStore.getState().setMatchOver(over)
    useAppStore.getState().setToast(`${over.winnerName} 打倒了鴨大王與飲水機`)
    setTimeout(() => useAppStore.getState().setToast(null), 3200)
  })

  socket.on('combat:skill', ({ text }: { text: string }) => {
    useAppStore.getState().setToast(text)
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  socket.on(
    'combat:hit',
    (payload: { id: string; kind: 'player' | 'monster'; amount: number; x: number; z: number }) => {
      useAppStore.getState().pushHit(payload)
    },
  )

  socket.on('note:added', (note: StickyNote) => {
    useAppStore.getState().addNote(note)
  })

  socket.on('note:removed', ({ id }: { id: string }) => {
    useAppStore.getState().removeNote(id)
  })

  socket.on('note:updated', (note: StickyNote) => {
    useAppStore.getState().patchNote(note)
  })

  socket.on('player:swing', ({ id }: { id: string }) => {
    useAppStore.getState().setSwing(id, performance.now())
  })

  socket.on('player:hidden', ({ id, hidden }: { id: string; hidden: boolean }) => {
    useAppStore.getState().patchPlayer(id, { hidden })
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

export function joinRoom(
  roomId: string,
  name: string,
  wantHost = false,
  scene: SceneId = 'kenney',
  mode: GameMode = 'hunt',
) {
  const s = connectSocket()
  return new Promise<RoomSnapshot>((resolve, reject) => {
    s.emit('join', { roomId, name, wantHost, scene, mode }, (snapshot: RoomSnapshot) => {
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

export function emitAddNote(text: string, position?: Vec3, fontSize?: number) {
  return new Promise<StickyNote | null>((resolve) => {
    socket?.emit('note:add', { text, position, fontSize }, (note: StickyNote | null) => {
      resolve(note)
    })
  })
}

export function emitRemoveNote(id: string) {
  socket?.emit('note:remove', { id })
}

export function emitUpdateNote(id: string, text: string, fontSize?: number) {
  socket?.emit('note:update', { id, text, fontSize })
}

export function emitHide(hidden: boolean) {
  socket?.emit('hide', { hidden })
}

let lastAttackAt = 0
export function performAttack() {
  const now = performance.now()
  if (attackBlocked()) return
  const state = useAppStore.getState()
  if (state.pendingNote || state.noteAsk) return
  if (now - lastAttackAt < ATTACK_COOLDOWN_MS) return
  lastAttackAt = now
  if (state.selfId) state.setSwing(state.selfId, now)
  socket?.emit('attack')
}

export function emitFurnitureMove(id: string, position: Vec3, rotationY?: number) {
  return new Promise<{ ok: boolean; reason?: string }>((resolve) => {
    socket?.emit('furniture:move', { id, position, rotationY }, (ok: boolean, reason?: string) => {
      resolve({ ok, reason })
    })
  })
}

export function emitFurniturePush(id: string, position: Vec3) {
  socket?.emit('furniture:push', { id, position })
}

export function emitAttack() {
  socket?.emit('attack')
}

export function disconnectSocket() {
  stopVoiceSession()
  socket?.disconnect()
  socket = null
  useAppStore.getState().leaveToLobby()
}

export type { FurnitureItem }
