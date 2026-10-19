import { io, Socket } from 'socket.io-client'
import { ATTACK_COOLDOWN_MS } from '../../shared/combat'
import type { FurnitureItem } from '../../shared/furniture'
import { attackBlocked } from '../scene/inputLock'
import type { MonsterState, PlayerState, RoomSnapshot, SeatId, StickyNote, Vec3 } from '../types'
import type { MatchOver } from '../../shared/combat'
import type { TagHud } from '../../shared/tag'
import type { GameMode } from '../../shared/modes'
import type { SceneId } from '../../shared/scenes'
import { playSfx, unlockSfx } from '../audio/sfx'
import { useAppStore } from '../store'
import { clearSession, getPlayerId, loadSession, saveSession, type RoomSession } from './session'
import { restartVoiceSession, startVoiceSession, stopVoiceSession } from './voice'

let socket: Socket | null = null
let listenersBound = false
let watchersBound = false
let joinInFlight: Promise<RoomSnapshot> | null = null
let joinSeq = 0
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
    timed: saved?.timed ?? false,
  }
}

function networkOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function markDisconnected() {
  if (leaving || useAppStore.getState().phase !== 'room') return
  if (networkOffline() || useAppStore.getState().connection !== 'booting') {
    useAppStore.getState().setConnection('reconnecting')
  }
  if (bootTimer) clearTimeout(bootTimer)
  bootTimer = setTimeout(() => {
    void refreshConnectionBanner()
  }, 4000)
  startHealthWatch()
}

async function refreshConnectionBanner() {
  if (leaving || socket?.connected || useAppStore.getState().phase !== 'room') return
  if (networkOffline()) {
    useAppStore.getState().setConnection('reconnecting')
    return
  }
  const health = await pingHealth()
  if (leaving || socket?.connected) return
  useAppStore.getState().setConnection(health === 'down' ? 'booting' : 'reconnecting')
}

function markOnline() {
  if (bootTimer) {
    clearTimeout(bootTimer)
    bootTimer = null
  }
  stopHealthWatch()
  useAppStore.getState().setConnection('online')
}

async function pingHealth(): Promise<'ok' | 'down' | 'offline'> {
  if (networkOffline()) return 'offline'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch('/health', { cache: 'no-store', signal: ctrl.signal })
    if (res.ok) return 'ok'
    if (res.status >= 500) return 'down'
    return 'down'
  } catch {
    return networkOffline() ? 'offline' : 'down'
  } finally {
    clearTimeout(timer)
  }
}

function startHealthWatch() {
  if (healthTimer) return
  const tick = async () => {
    await refreshConnectionBanner()
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
    void resumeRoom({ force: true })
  }

  document.addEventListener('pointerdown', () => unlockSfx(), { once: true })
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('pageshow', wake)
  window.addEventListener('online', wake)
  window.addEventListener('offline', () => {
    if (!leaving && useAppStore.getState().phase === 'room') {
      useAppStore.getState().setConnection('reconnecting')
    }
  })
  window.addEventListener('focus', wake)
}

function bindListeners(s: Socket) {
  if (listenersBound) return
  listenersBound = true

  s.on('connect', () => {
    if (leaving) return
    if (loadSession() && useAppStore.getState().phase === 'room') {
      void resumeRoom({ force: true })
    }
  })

  s.on('disconnect', (reason) => {
    lastVoiceSocketId = null
    if (leaving || reason === 'io client disconnect') return
    markDisconnected()
  })

  s.io.on('reconnect_attempt', () => {
    if (leaving || useAppStore.getState().phase !== 'room') return
    void refreshConnectionBanner()
  })

  s.io.on('reconnect_error', () => {
    if (leaving || useAppStore.getState().phase !== 'room') return
    void refreshConnectionBanner()
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

  s.on('player:moved', (payload: { id: string; position: Vec3; rotationY: number; snap?: boolean }) => {
    const selfId = useAppStore.getState().selfId
    if (payload.id === selfId && !payload.snap) return
    useAppStore.getState().patchPlayer(payload.id, {
      position: payload.position,
      rotationY: payload.rotationY,
    })
    if (payload.snap && payload.id === selfId) {
      lastPose = { position: payload.position, rotationY: payload.rotationY }
      useAppStore.getState().bumpPoseSync()
    }
  })

  s.on('player:vitals', ({ id, hp }: { id: string; hp: number }) => {
    useAppStore.getState().patchPlayer(id, { hp })
  })

  s.on('player:respawn', (payload: { position: Vec3; hp: number; rotationY: number; reason?: string }) => {
    const selfId = useAppStore.getState().selfId
    if (!selfId) return
    useAppStore.getState().patchPlayer(selfId, {
      position: payload.position,
      rotationY: payload.rotationY,
      hp: payload.hp,
      seated: null,
      hidden: false,
    })
    lastPose = { position: payload.position, rotationY: payload.rotationY }
    useAppStore.getState().bumpRespawn()
    useAppStore.getState().setToast(payload.reason === 'restart' ? '新的一局開始' : '你被打倒了，已送回入口')
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  s.on('monsters:sync', (monsters: MonsterState[]) => {
    useAppStore.getState().setMonsters(monsters)
  })

  s.on('match:over', (over: MatchOver) => {
    useAppStore.getState().setMatchOver(over)
    const text =
      over.winner === 'ghosts'
        ? '鬼贏'
        : over.winner === 'hiders'
          ? '躲的人贏'
          : over.teamWin
            ? '全隊打倒了鴨大王！'
            : '時間到，全隊失敗'
    useAppStore.getState().setToast(text)
    setTimeout(() => useAppStore.getState().setToast(null), 3200)
  })

  s.on('boss:phase', ({ phase }: { phase: 1 | 2 }) => {
    if (phase !== 2) return
    useAppStore.getState().setToast('鴨大王生氣了！')
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  s.on('boss:telegraph', (payload: { x: number; z: number; r: number; ms: number }) => {
    useAppStore.getState().setTelegraph(payload)
    useAppStore.getState().setToast('鴨大王要震地了！')
    setTimeout(() => useAppStore.getState().setToast(null), payload.ms)
    playSfx('slam')
    useAppStore.getState().triggerHitFeel('slam')
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(100)
    }
  })

  s.on('combat:skill', ({ text }: { text: string }) => {
    useAppStore.getState().setToast(text)
    setTimeout(() => useAppStore.getState().setToast(null), 2200)
  })

  s.on(
    'combat:hit',
    (payload: {
      id: string
      kind: 'player' | 'monster'
      amount: number
      x: number
      z: number
      by?: string | null
    }) => {
      useAppStore.getState().pushHit(payload)
      const selfId = useAppStore.getState().selfId
      if (payload.kind === 'monster') {
        if (payload.by === selfId) {
          playSfx('hit')
          useAppStore.getState().triggerHitFeel('hit')
        }
      } else if (payload.id === selfId) {
        playSfx('hurt')
        useAppStore.getState().triggerHitFeel('hurt')
      }
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

  s.on('player:dash', (payload: { id: string; until: number; dirX: number; dirZ: number }) => {
    useAppStore.getState().setDash(payload.id, payload.until)
  })

  s.on('dash:result', (payload: { ok: boolean; nextAt?: number; until?: number }) => {
    if (payload.nextAt) useAppStore.getState().setDashReadyAt(payload.nextAt)
    if (payload.ok && payload.until) {
      const id = useAppStore.getState().selfId
      if (id) useAppStore.getState().setDash(id, payload.until)
    }
  })

  s.on('player:hidden', (payload: { id: string; hidden: boolean; position?: Vec3; rotationY?: number }) => {
    useAppStore.getState().patchPlayer(payload.id, {
      hidden: payload.hidden,
      position: payload.position,
      rotationY: payload.rotationY,
    })
  })

  s.on('tag:hud', (hud: TagHud | null) => {
    useAppStore.getState().setTagHud(hud)
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
  const seq = ++joinSeq
  const resume = lastPose
    ? { position: lastPose.position, rotationY: lastPose.rotationY, seated: me?.seated }
    : me
      ? {
          position: me.position,
          rotationY: me.rotationY,
          seated: me.seated,
        }
      : undefined

  return new Promise<RoomSnapshot>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (seq !== joinSeq) return
      reject(new Error('加入逾時'))
    }, 8000)
    s.emit(
      'join',
      {
        roomId: session.roomId,
        name: session.name,
        wantHost: session.wantHost,
        scene: session.scene,
        mode: session.mode,
        playerId,
        timed: session.timed,
        resume,
      },
      (snapshot: RoomSnapshot) => {
        clearTimeout(timer)
        if (seq !== joinSeq) return
        if (!snapshot || snapshot.error) {
          reject(new Error(snapshot?.error || '加入失敗'))
          return
        }
        saveSession({ ...session, playerId })
        useAppStore.getState().enterRoom(playerId, snapshot)
        if (snapshot.players[playerId]?.hidden) useAppStore.getState().bumpPoseSync()
        const peers = Object.keys(snapshot.players).filter((id) => id !== playerId)
        const sid = s.id ?? null
        if (sid && sid === lastVoiceSocketId) {
          startVoiceSession(playerId, peers)
        } else {
          lastVoiceSocketId = sid
          restartVoiceSession(playerId, peers)
        }
        const hid = snapshot.players[playerId]?.hidden
        if (lastPose && !hid) s.emit('move', lastPose)
        markOnline()
        resolve(snapshot)
      },
    )
  })
}

async function joinWithRetry(session: RoomSession) {
  connectSocket()
  const task = emitJoin(session).finally(() => {
    if (joinInFlight === task) joinInFlight = null
  })
  joinInFlight = task
  return task
}

export async function resumeRoom(opts?: { force?: boolean }) {
  if (leaving) return null
  const session = sessionFromStore()
  if (!session) return null
  if (useAppStore.getState().phase !== 'room') {
    useAppStore.getState().setLobby(session.name, session.roomId)
    if (useAppStore.getState().connection === 'online') {
      useAppStore.getState().setConnection('reconnecting')
    }
  }
  if (joinInFlight && opts?.force) {
    joinSeq += 1
    joinInFlight = null
  }
  try {
    return await joinWithRetry(session)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === '房間已滿') {
      failJoinFull(msg)
      return null
    }
    if (socket?.connected && opts?.force) {
      try {
        return await joinWithRetry(session)
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : ''
        if (msg2 === '房間已滿') {
          failJoinFull(msg2)
          return null
        }
      }
    }
    if (!socket?.connected) markDisconnected()
    else void joinWithRetry(session).catch((err) => {
      const m = err instanceof Error ? err.message : ''
      if (m === '房間已滿') failJoinFull(m)
      else markDisconnected()
    })
    return null
  }
}

function failJoinFull(msg: string) {
  joinSeq += 1
  joinInFlight = null
  lastPose = null
  lastVoiceSocketId = null
  clearSession()
  if (socket) {
    socket.io.reconnection(false)
    socket.removeAllListeners()
    socket.io.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  listenersBound = false
  useAppStore.getState().leaveToLobby()
  useAppStore.getState().setJoinError(msg)
  useAppStore.getState().setConnection('online')
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
  void resumeRoom({ force: true })
}

export function joinRoom(
  roomId: string,
  name: string,
  wantHost = false,
  scene: SceneId = 'kenney',
  mode: GameMode = 'hunt',
  timed = false,
) {
  leaving = false
  useAppStore.getState().setJoinError(null)
  const session: RoomSession = {
    playerId: getPlayerId(),
    roomId,
    name,
    scene,
    mode,
    wantHost,
    timed,
  }
  saveSession(session)
  return joinWithRetry(session).catch((e) => {
    if (e instanceof Error && e.message === '房間已滿') {
      clearSession()
      useAppStore.getState().setJoinError(e.message)
    }
    throw e
  })
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

export function emitCheck() {
  socket?.emit('check')
}

let lastAttackAt = 0
export function performAttack() {
  const now = performance.now()
  if (attackBlocked()) return
  const state = useAppStore.getState()
  if (state.pendingNote || state.noteAsk) return
  const me = state.selfId ? state.players[state.selfId] : null
  if ((state.mode === 'boss' || state.mode === 'tag') && !state.started) return
  if (state.mode === 'tag' && (me?.team === 'spectator' || ((state.tagHud?.hideLeftMs ?? 0) > 0 && me?.team === 'ghost'))) return
  if (me?.hidden) {
    state.setToast('躲藏中不能攻擊')
    setTimeout(() => useAppStore.getState().setToast(null), 1600)
    return
  }
  if (now - lastAttackAt < ATTACK_COOLDOWN_MS) return
  lastAttackAt = now
  if (state.selfId) state.setSwing(state.selfId, now)
  playSfx('attack', 0.96 + Math.random() * 0.08)
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

export function emitRestart() {
  socket?.emit('match:restart')
}

export function emitStart() {
  socket?.emit('match:start')
}

export function emitDash(dirX: number, dirZ: number) {
  socket?.emit('dash', { dirX, dirZ })
}

export function disconnectSocket() {
  leaving = true
  lastPose = null
  lastVoiceSocketId = null
  joinInFlight = null
  joinSeq += 1
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
