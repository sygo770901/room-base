import { io, Socket } from 'socket.io-client'
import { ATTACK_COOLDOWN_MS } from '../../shared/combat'
import type { FurnitureItem } from '../../shared/furniture'
import { attackBlocked } from '../scene/inputLock'
import type { MonsterState, PlayerState, RoomSnapshot, SeatId, StickyNote, Vec3 } from '../types'
import type { MatchOver } from '../../shared/combat'
import type { GameMode } from '../../shared/modes'
import type { SceneId } from '../../shared/scenes'
import { useAppStore } from '../store'
import { clearSession, getPlayerId, loadSession, saveSession, type RoomSession } from './session'
import { restartVoiceSession, startVoiceSession, stopVoiceSession } from './voice'

let socket: Socket | null = null
let listenersBound = false
let watchersBound = false
let joinInFlight: Promise<RoomSnapshot> | null = null
let lastVoiceSocketId: string | null = null
let lastPose: { position: Vec3; rotationY: number } | null = null
let bootTimer: ReturnType<typeof setTimeout> | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
let leaving = false

export function getSocket() {
  return socket
}

function sessionFromStore(wantHost = false): RoomSession | null {
  const saved = loadSession()
  const state = useAppStore.getState()
  const roomId = state.roomId || saved?.roomId
  const name = state.displayName || saved?.name
  if (!roomId || !name) return saved
  return {
    playerId: getPlayerId(),
    roomId,
    name,
    scene: state.scene || saved?.scene || 'kenney',
    mode: state.mode || saved?.mode || 'hunt',
    wantHost: saved?.wantHost ?? wantHost,
  }
}

function markDisconnected() {
  if (leaving || useAppStore.getState().phase !== 'room') return
  if (useAppStore.getState().connection === 'online') {
    useAppStore.getState().setConnection('reconnecting')
  }
  if (bootTimer) clearTimeout(bootTimer)
  bootTimer = setTimeout(() => {
    void (async () => {
      if (leaving || socket?.connected) return
      const ok = await pingHealth()
      if (!ok && useAppStore.getState().phase === 'room') {
        useAppStore.getState().setConnection('booting')
      }
    })()
  }, 5000)
  startHealthWatch()
}

function markOnline() {
  if (bootTimer) {
    clearTimeout(bootTimer)
    bootTimer = null
  }
  stopHealthWatch()
  useAppStore.getState().setConnection('online')
}

async function pingHealth() {
  try {
    const res = await fetch('/health', { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

function startHealthWatch() {
  if (healthTimer) return
  const tick = async () => {
    if (leaving || useAppStore.getState().phase !== 'room') return
    if (socket?.connected) return
    const ok = await pingHealth()
    if (!ok) useAppStore.getState().setConnection('booting')
    else if (useAppStore.getState().connection === 'booting') {
      useAppStore.getState().setConnection('reconnecting')
    }
  }
  void tick()
  healthTimer = setInterval(() => void tick(), 2500)
}

function stopHealthWatch() {
  if (!healthTimer) return
  clearInterval(healthTimer)
  healthTimer = null
}

function bindWatchers() {
  if (watchersBound || typeof window === 'undefined') return
  watchersBound = true

  const wake = () => {
    if (leaving || !loadSession()) return
    if (document.visibilityState === 'hidden') return
    const s = connectSocket()
    if (!s.connected) {
      markDisconnected()
      s.connect()
      return
    }
    void resumeRoom()
  }

  document.addEventListener('visibilitychange', wake)
  window.addEventListener('pageshow', wake)
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
}

function bindListeners(s: Socket) {
  if (listenersBound) return
  listenersBound = true

  s.on('connect', () => {
    if (leaving) return
    if (loadSession() && useAppStore.getState().phase === 'room') {
      void resumeRoom()
    }
  })

  s.on('disconnect', (reason) => {
    lastVoiceSocketId = null
    if (leaving || reason === 'io client disconnect') return
    markDisconnected()
  })

  s.io.on('reconnect_attempt', (attempt) => {
    if (leaving || useAppStore.getState().phase !== 'room') return
    if (useAppStore.getState().connection === 'online') {
      useAppStore.getState().setConnection('reconnecting')
    }
    if (attempt >= 3) {
      void pingHealth().then((ok) => {
        if (!ok && !socket?.connected && useAppStore.getState().phase === 'room') {
          useAppStore.getState().setConnection('booting')
        }
      })
    }
  })

  s.io.on('reconnect_error', () => {
    if (leaving || useAppStore.getState().phase !== 'room') return
    void pingHealth().then((ok) => {
      if (!ok && !socket?.connected) useAppStore.getState().setConnection('booting')
    })
  })

  s.on('connect_error', () => {
    if (leaving || !loadSession()) return
    markDisconnected()
  })

  s.on('room:state', (snapshot: RoomSnapshot) => {
    useAppStore.getState().applySnapshot(snapshot)
  })

  s.on('player:joined', (player: PlayerState) => {
    useAppStore.getState().upsertPlayer(player)
  })

  s.on('player:left', ({ id }: { id: string }) => {
    if (id === useAppStore.getState().selfId) return
    useAppStore.getState().removePlayer(id)
  })

  s.on('player:moved', (payload: { id: string; position: Vec3; rotationY: number }) => {
    useAppStore.getState().patchPlayer(payload.id, {
      position: payload.position,
      rotationY: payload.rotationY,
    })
  })

  s.on('player:vitals', ({ id, hp }: { id: string; hp: number }) => {
    useAppStore.getState().patchPlayer(id, { hp })
  })

  s.on('player:respawn', (payload: { position: Vec3; hp: number; rotationY: number }) => {
    const selfId = useAppStore.getState().selfId
    if (!selfId) return
    useAppStore.getState().patchPlayer(selfId, {
      position: payload.position,
      rotationY: payload.rotationY,
      hp: payload.hp,
      seated: null,
    })
    lastPose = { position: payload.position, rotationY: payload.rotationY }
    useAppStore.getState().bumpRespawn()
    useAppStore.getState().setToast('你被打倒了，已送回入口')
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  s.on('monsters:sync', (monsters: MonsterState[]) => {
    useAppStore.getState().setMonsters(monsters)
  })

  s.on('match:over', (over: MatchOver) => {
    useAppStore.getState().setMatchOver(over)
    useAppStore.getState().setToast(`${over.winnerName} 打倒了鴨大王與飲水機`)
    setTimeout(() => useAppStore.getState().setToast(null), 3200)
  })

  s.on('combat:skill', ({ text }: { text: string }) => {
    useAppStore.getState().setToast(text)
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  s.on(
    'combat:hit',
    (payload: { id: string; kind: 'player' | 'monster'; amount: number; x: number; z: number }) => {
      useAppStore.getState().pushHit(payload)
    },
  )

  s.on('note:added', (note: StickyNote) => {
    useAppStore.getState().addNote(note)
  })

  s.on('note:removed', ({ id }: { id: string }) => {
    useAppStore.getState().removeNote(id)
  })

  s.on('note:updated', (note: StickyNote) => {
    useAppStore.getState().patchNote(note)
  })

  s.on('player:swing', ({ id }: { id: string }) => {
    useAppStore.getState().setSwing(id, performance.now())
  })

  s.on('player:hidden', ({ id, hidden }: { id: string; hidden: boolean }) => {
    useAppStore.getState().patchPlayer(id, { hidden })
  })

  s.on(
    'furniture:updated',
    (payload: { id: string; position: Vec3; rotationY: number }) => {
      useAppStore.getState().patchFurniture(payload.id, {
        position: payload.position,
        rotationY: payload.rotationY,
      })
    },
  )
}

export function connectSocket() {
  bindWatchers()
  if (socket) return socket
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 12000,
    auth: { playerId: getPlayerId() },
  })
  bindListeners(socket)
  return socket
}

function emitJoin(session: RoomSession) {
  const s = connectSocket()
  const playerId = session.playerId || getPlayerId()
  const state = useAppStore.getState()
  const me = state.selfId ? state.players[state.selfId] : null
  const resume = lastPose
    ? { ...lastPose, hp: me?.hp, hidden: me?.hidden, seated: me?.seated }
    : me
      ? {
          position: me.position,
          rotationY: me.rotationY,
          hp: me.hp,
          hidden: me.hidden,
          seated: me.seated,
        }
      : undefined

  return new Promise<RoomSnapshot>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('加入逾時')), 15000)
    s.emit(
      'join',
      {
        roomId: session.roomId,
        name: session.name,
        wantHost: session.wantHost,
        scene: session.scene,
        mode: session.mode,
        playerId,
        resume,
      },
      (snapshot: RoomSnapshot) => {
        clearTimeout(timer)
        if (!snapshot) {
          reject(new Error('加入失敗'))
          return
        }
        saveSession({ ...session, playerId })
        useAppStore.getState().enterRoom(playerId, snapshot)
        const peers = Object.keys(snapshot.players).filter((id) => id !== playerId)
        const sid = s.id ?? null
        if (sid && sid === lastVoiceSocketId) {
          startVoiceSession(playerId, peers)
        } else {
          lastVoiceSocketId = sid
          restartVoiceSession(playerId, peers)
        }
        if (lastPose) s.emit('move', lastPose)
        markOnline()
        resolve(snapshot)
      },
    )
  })
}

async function joinWithRetry(session: RoomSession) {
  if (joinInFlight) return joinInFlight
  connectSocket()
  const task = emitJoin(session).finally(() => {
    joinInFlight = null
  })
  joinInFlight = task
  return task
}

export async function resumeRoom() {
  if (leaving) return null
  const session = sessionFromStore()
  if (!session) return null
  if (useAppStore.getState().phase !== 'room') {
    useAppStore.getState().setLobby(session.name, session.roomId)
    if (useAppStore.getState().connection === 'online') {
      useAppStore.getState().setConnection('reconnecting')
    }
  }
  try {
    return await joinWithRetry(session)
  } catch {
    markDisconnected()
    return null
  }
}

export function resumeSessionIfNeeded() {
  const session = loadSession()
  if (!session) return
  const state = useAppStore.getState()
  state.setLobby(session.name, session.roomId)
  if (state.phase !== 'room') {
    state.enterRoom(session.playerId, {
      roomId: session.roomId,
      scene: session.scene,
      mode: session.mode,
      hostId: null,
      players: {},
      notes: [],
      seats: {},
      furniture: [],
      monsters: [],
      matchOver: null,
    })
    state.setConnection('reconnecting')
  }
  void resumeRoom()
}

export function joinRoom(
  roomId: string,
  name: string,
  wantHost = false,
  scene: SceneId = 'kenney',
  mode: GameMode = 'hunt',
) {
  leaving = false
  const session: RoomSession = {
    playerId: getPlayerId(),
    roomId,
    name,
    scene,
    mode,
    wantHost,
  }
  saveSession(session)
  return joinWithRetry(session)
}

export function emitMove(position: Vec3, rotationY: number) {
  lastPose = { position, rotationY }
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
  leaving = true
  lastPose = null
  lastVoiceSocketId = null
  joinInFlight = null
  clearSession()
  markOnline()
  stopVoiceSession()
  if (socket) {
    socket.io.reconnection(false)
    socket.emit('leave')
    socket.removeAllListeners()
    socket.io.removeAllListeners()
    socket.disconnect()
  }
  socket = null
  listenersBound = false
  useAppStore.getState().leaveToLobby()
}

export type { FurnitureItem }
