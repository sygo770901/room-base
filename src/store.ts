import { create } from 'zustand'
import { type MatchOver, type MonsterState } from '../shared/combat'
import { DEFAULT_FURNITURE, type FurnitureItem } from '../shared/furniture'
import type { PlayerState, RoomSnapshot, StickyNote, Vec3 } from './types'
import { defaultSettings, type GameMode, type RoomSettings } from '../shared/modes'
import type { TagHud } from '../shared/tag'
import type { SceneId } from '../shared/scenes'
import type { BarrelState, LootDrop } from '../shared/barrels'
import type { SmokeCloud } from '../shared/smoke'
import { LOOK_SENS_DEFAULT, LOOK_SENS_MAX, LOOK_SENS_MIN } from '../shared/input'
import { loadSession } from './net/session'

function readLookSens() {
  if (typeof localStorage === 'undefined') return LOOK_SENS_DEFAULT
  const n = Number(localStorage.getItem('rb-look-sens'))
  if (!Number.isFinite(n)) return LOOK_SENS_DEFAULT
  return Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, n))
}

const boot = typeof localStorage === 'undefined' ? null : loadSession()

export type NoteAsk =
  | { kind: 'place'; position: Vec3; text: string; fontSize: number }
  | { kind: 'manage'; id: string }

export type HitFx = {
  key: number
  id: string
  kind: 'player' | 'monster'
  amount: number
  x: number
  z: number
  at: number
}

export type ConnectionStatus = 'online' | 'reconnecting' | 'booting'

interface AppState {
  phase: 'lobby' | 'room'
  connection: ConnectionStatus
  selfId: string | null
  roomId: string
  scene: SceneId
  mode: GameMode
  matchOver: MatchOver | null
  settings: RoomSettings
  timeLeftMs: number | null
  startInMs: number
  started: boolean
  joinError: string | null
  tagHud: TagHud | null
  poseSync: number
  hitStopUntil: number
  shakeUntil: number
  shakeAmp: number
  sfxOn: boolean
  lookSensitivity: number
  pointerLocked: boolean
  displayName: string
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
  monsters: MonsterState[]
  hostId: string | null
  toast: string | null
  micOn: boolean
  followCam: boolean
  /** 搖桿輸入 -1..1 */
  joy: { x: number; y: number }
  /** 被怪物打倒後遞增，讓本地控制器把座標拉回入口 */
  respawnToken: number
  pendingNote: { text: string; fontSize: number } | null
  noteAsk: NoteAsk | null
  swings: Record<string, number>
  hits: HitFx[]
  hitSeq: number
  telegraph: { x: number; z: number; r: number; ms: number; until: number } | null
  dashUntil: Record<string, number>
  dashReadyAt: number
  dashRequest: number
  smokes: SmokeCloud[]
  smokeReadyAt: number
  smokeRequest: number
  barrels: BarrelState[]
  drops: LootDrop[]
  setLobby: (name: string, roomId: string) => void
  enterRoom: (selfId: string, snapshot: RoomSnapshot) => void
  applySnapshot: (snapshot: RoomSnapshot) => void
  upsertPlayer: (player: PlayerState) => void
  removePlayer: (id: string) => void
  patchPlayer: (id: string, patch: Partial<Pick<PlayerState, 'position' | 'rotationY' | 'seated' | 'hp' | 'hidden' | 'team' | 'weapon' | 'weaponUntil'>>) => void
  addNote: (note: StickyNote) => void
  patchNote: (note: StickyNote) => void
  removeNote: (id: string) => void
  patchFurniture: (id: string, patch: Partial<Pick<FurnitureItem, 'position' | 'rotationY'>>) => void
  setFurniture: (furniture: FurnitureItem[]) => void
  setToast: (msg: string | null) => void
  setMicOn: (on: boolean) => void
  setFollowCam: (on: boolean) => void
  setJoy: (x: number, y: number) => void
  setPendingNote: (note: { text: string; fontSize: number } | null) => void
  setNoteAsk: (ask: NoteAsk | null) => void
  setSwing: (id: string, at: number) => void
  pushHit: (hit: Omit<HitFx, 'key' | 'at'>) => void
  setMonsters: (monsters: MonsterState[]) => void
  setMatchOver: (over: MatchOver | null) => void
  setTelegraph: (tel: { x: number; z: number; r: number; ms: number } | null) => void
  bumpRespawn: () => void
  bumpPoseSync: () => void
  setTagHud: (hud: TagHud | null) => void
  triggerHitFeel: (kind: 'hit' | 'hurt' | 'slam') => void
  setSfxOn: (on: boolean) => void
  setLookSensitivity: (n: number) => void
  setPointerLocked: (on: boolean) => void
  setDash: (id: string, until: number) => void
  setDashReadyAt: (at: number) => void
  requestDash: () => void
  setSmokes: (smokes: SmokeCloud[]) => void
  setSmokeReadyAt: (at: number) => void
  requestSmoke: () => void
  setBarrels: (barrels: BarrelState[]) => void
  setDrops: (drops: LootDrop[]) => void
  setConnection: (status: ConnectionStatus) => void
  setJoinError: (msg: string | null) => void
  leaveToLobby: () => void
}

export const useAppStore = create<AppState>((set) => ({
  phase: boot ? 'room' : 'lobby',
  connection: boot ? 'reconnecting' : 'online',
  selfId: boot?.playerId ?? null,
  roomId: boot?.roomId ?? 'home',
  scene: boot?.scene ?? 'kenney',
  mode: boot?.mode ?? 'hunt',
  matchOver: null,
  settings: defaultSettings(),
  timeLeftMs: null,
  startInMs: 0,
  started: false,
  joinError: null,
  tagHud: null,
  poseSync: 0,
  hitStopUntil: 0,
  shakeUntil: 0,
  shakeAmp: 0,
  sfxOn: typeof localStorage === 'undefined' ? true : localStorage.getItem('rb-sfx') !== '0',
  lookSensitivity: readLookSens(),
  pointerLocked: false,
  displayName: boot?.name ?? '',
  players: {},
  notes: [],
  seats: {},
  furniture: DEFAULT_FURNITURE,
  monsters: [],
  hostId: null,
  toast: null,
  micOn: false,
  followCam: true,
  joy: { x: 0, y: 0 },
  respawnToken: 0,
  pendingNote: null,
  noteAsk: null,
  swings: {},
  hits: [],
  hitSeq: 1,
  telegraph: null,
  dashUntil: {},
  dashReadyAt: 0,
  dashRequest: 0,
  smokes: [],
  smokeReadyAt: 0,
  smokeRequest: 0,
  barrels: [],
  drops: [],
  setLobby: (name, roomId) => set({ displayName: name, roomId }),
  enterRoom: (selfId, snapshot) =>
    set({
      phase: 'room',
      connection: 'online',
      selfId,
      roomId: snapshot.roomId,
      scene: snapshot.scene ?? 'kenney',
      mode: snapshot.mode ?? 'hunt',
      matchOver: snapshot.matchOver ?? null,
      settings: snapshot.settings ?? defaultSettings(),
      timeLeftMs: snapshot.timeLeftMs ?? null,
      startInMs: snapshot.startInMs ?? 0,
      started: snapshot.started ?? false,
      joinError: null,
      tagHud: snapshot.tagHud ?? null,
      players: snapshot.players,
      notes: snapshot.notes,
      seats: snapshot.seats,
      furniture: snapshot.furniture?.length ? snapshot.furniture : DEFAULT_FURNITURE,
      monsters: snapshot.monsters ?? [],
      hostId: snapshot.hostId,
      smokes: snapshot.smokes ?? [],
      barrels: snapshot.barrels ?? [],
      drops: snapshot.drops ?? [],
    }),
  applySnapshot: (snapshot) =>
    set((s) => ({
      players: snapshot.players,
      notes: snapshot.notes,
      seats: snapshot.seats,
      furniture: snapshot.furniture?.length ? snapshot.furniture : DEFAULT_FURNITURE,
      monsters: snapshot.monsters ?? [],
      hostId: snapshot.hostId,
      roomId: snapshot.roomId,
      scene: snapshot.scene ?? s.scene,
      mode: snapshot.mode ?? s.mode,
      matchOver: snapshot.matchOver ?? null,
      settings: snapshot.settings ?? s.settings,
      timeLeftMs: snapshot.timeLeftMs ?? s.timeLeftMs,
      startInMs: snapshot.startInMs ?? s.startInMs,
      started: snapshot.started ?? s.started,
      tagHud: snapshot.tagHud ?? s.tagHud,
      smokes: snapshot.smokes ?? s.smokes,
      barrels: snapshot.barrels ?? s.barrels,
      drops: snapshot.drops ?? s.drops,
    })),
  upsertPlayer: (player) =>
    set((s) => ({ players: { ...s.players, [player.id]: player } })),
  removePlayer: (id) =>
    set((s) => {
      const players = { ...s.players }
      delete players[id]
      return { players }
    }),
  patchPlayer: (id, patch) =>
    set((s) => {
      const prev = s.players[id]
      if (!prev) return s
      const next = { ...prev, ...patch }
      if ('position' in patch && patch.position === undefined) delete next.position
      return { players: { ...s.players, [id]: next } }
    }),
  addNote: (note) => set((s) => ({ notes: [...s.notes.filter((n) => n.id !== note.id), note] })),
  patchNote: (note) => set((s) => ({ notes: s.notes.map((n) => (n.id === note.id ? note : n)) })),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  patchFurniture: (id, patch) =>
    set((s) => ({
      furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  setFurniture: (furniture) => set({ furniture }),
  setToast: (msg) => set({ toast: msg }),
  setMicOn: (on) => set({ micOn: on }),
  setFollowCam: (on) => set({ followCam: on }),
  setJoy: (x, y) => set({ joy: { x, y } }),
  setPendingNote: (note) => set({ pendingNote: note, noteAsk: null }),
  setNoteAsk: (ask) => set({ noteAsk: ask }),
  setSwing: (id, at) => set((s) => ({ swings: { ...s.swings, [id]: at } })),
  pushHit: (hit) =>
    set((s) => {
      const now = performance.now()
      const hits = s.hits.filter((h) => now - h.at < 800)
      hits.push({ ...hit, key: s.hitSeq, at: now })
      return { hits: hits.slice(-20), hitSeq: s.hitSeq + 1 }
    }),
  setMonsters: (monsters) => set({ monsters }),
  setMatchOver: (over) => set({ matchOver: over }),
  setTelegraph: (tel) =>
    set({
      telegraph: tel ? { ...tel, until: performance.now() + tel.ms } : null,
    }),
  bumpRespawn: () => set((s) => ({ respawnToken: s.respawnToken + 1 })),
  bumpPoseSync: () => set((s) => ({ poseSync: s.poseSync + 1 })),
  setTagHud: (hud) => set({ tagHud: hud }),
  triggerHitFeel: (kind) => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('rb-sfx') === '0') return
    const mobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    const now = performance.now()
    const stop = kind === 'slam' ? 70 : 42
    const shake = kind === 'slam' ? 280 : 140
    const amp = (kind === 'slam' ? 0.16 : 0.07) * (mobile ? 0.45 : 1)
    set({ hitStopUntil: now + stop, shakeUntil: now + shake, shakeAmp: amp })
  },
  setSfxOn: (on) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('rb-sfx', on ? '1' : '0')
    set({ sfxOn: on, shakeAmp: on ? 0.07 : 0, shakeUntil: on ? 0 : 0 })
  },
  setLookSensitivity: (n) => {
    const v = Math.min(LOOK_SENS_MAX, Math.max(LOOK_SENS_MIN, n))
    if (typeof localStorage !== 'undefined') localStorage.setItem('rb-look-sens', String(v))
    set({ lookSensitivity: v })
  },
  setPointerLocked: (on) => set({ pointerLocked: on }),
  setDash: (id, until) => set((s) => ({ dashUntil: { ...s.dashUntil, [id]: until } })),
  setDashReadyAt: (at) => set({ dashReadyAt: at }),
  requestDash: () => set((s) => ({ dashRequest: s.dashRequest + 1 })),
  setSmokes: (smokes) => set({ smokes }),
  setSmokeReadyAt: (at) => set({ smokeReadyAt: at }),
  requestSmoke: () => set((s) => ({ smokeRequest: s.smokeRequest + 1 })),
  setBarrels: (barrels) => set({ barrels }),
  setDrops: (drops) => set({ drops }),
  setConnection: (status) => set({ connection: status }),
  setJoinError: (msg) => set({ joinError: msg }),
  leaveToLobby: () =>
    set({
      phase: 'lobby',
      connection: 'online',
      selfId: null,
      players: {},
      notes: [],
      seats: {},
      furniture: DEFAULT_FURNITURE,
      monsters: [],
      matchOver: null,
      settings: defaultSettings(),
      timeLeftMs: null,
      startInMs: 0,
      started: false,
      joinError: null,
      tagHud: null,
      hitStopUntil: 0,
      shakeUntil: 0,
      shakeAmp: 0,
      hostId: null,
      micOn: false,
      pendingNote: null,
      noteAsk: null,
      swings: {},
      hits: [],
      hitSeq: 1,
      telegraph: null,
      joy: { x: 0, y: 0 },
      pointerLocked: false,
      dashUntil: {},
      dashReadyAt: 0,
      dashRequest: 0,
      smokes: [],
      smokeReadyAt: 0,
      smokeRequest: 0,
      barrels: [],
      drops: [],
    }),
}))

export type LocalPose = { position: Vec3; rotationY: number }
