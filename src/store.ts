import { create } from 'zustand'
import { DEFAULT_FURNITURE, type FurnitureItem } from '../shared/furniture'
import type { PlayerState, RoomSnapshot, StickyNote, Vec3 } from './types'

interface AppState {
  phase: 'lobby' | 'room'
  selfId: string | null
  roomId: string
  displayName: string
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: RoomSnapshot['seats']
  furniture: FurnitureItem[]
  hostId: string | null
  toast: string | null
  micOn: boolean
  setLobby: (name: string, roomId: string) => void
  enterRoom: (selfId: string, snapshot: RoomSnapshot) => void
  applySnapshot: (snapshot: RoomSnapshot) => void
  upsertPlayer: (player: PlayerState) => void
  removePlayer: (id: string) => void
  patchPlayer: (id: string, patch: Partial<Pick<PlayerState, 'position' | 'rotationY' | 'seated'>>) => void
  addNote: (note: StickyNote) => void
  removeNote: (id: string) => void
  patchFurniture: (id: string, patch: Partial<Pick<FurnitureItem, 'position' | 'rotationY'>>) => void
  setFurniture: (furniture: FurnitureItem[]) => void
  setToast: (msg: string | null) => void
  setMicOn: (on: boolean) => void
  leaveToLobby: () => void
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'lobby',
  selfId: null,
  roomId: 'home',
  displayName: '',
  players: {},
  notes: [],
  seats: { bed: null, chair: null, desk: null },
  furniture: DEFAULT_FURNITURE,
  hostId: null,
  toast: null,
  micOn: false,
  setLobby: (name, roomId) => set({ displayName: name, roomId }),
  enterRoom: (selfId, snapshot) =>
    set({
      phase: 'room',
      selfId,
      roomId: snapshot.roomId,
      players: snapshot.players,
      notes: snapshot.notes,
      seats: snapshot.seats,
      furniture: snapshot.furniture?.length ? snapshot.furniture : DEFAULT_FURNITURE,
      hostId: snapshot.hostId,
    }),
  applySnapshot: (snapshot) =>
    set({
      players: snapshot.players,
      notes: snapshot.notes,
      seats: snapshot.seats,
      furniture: snapshot.furniture?.length ? snapshot.furniture : DEFAULT_FURNITURE,
      hostId: snapshot.hostId,
      roomId: snapshot.roomId,
    }),
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
      return { players: { ...s.players, [id]: { ...prev, ...patch } } }
    }),
  addNote: (note) => set((s) => ({ notes: [...s.notes.filter((n) => n.id !== note.id), note] })),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  patchFurniture: (id, patch) =>
    set((s) => ({
      furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  setFurniture: (furniture) => set({ furniture }),
  setToast: (msg) => set({ toast: msg }),
  setMicOn: (on) => set({ micOn: on }),
  leaveToLobby: () =>
    set({
      phase: 'lobby',
      selfId: null,
      players: {},
      notes: [],
      seats: { bed: null, chair: null, desk: null },
      furniture: DEFAULT_FURNITURE,
      hostId: null,
      micOn: false,
    }),
}))

export type LocalPose = { position: Vec3; rotationY: number }
