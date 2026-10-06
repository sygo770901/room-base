import type { FurnitureItem } from '../shared/furniture'

export type Vec3 = [number, number, number]
export type SeatId = 'bed' | 'chair' | 'desk'

export interface PlayerState {
  id: string
  name: string
  color: string
  position: Vec3
  rotationY: number
  seated: SeatId | null
  role: 'host' | 'guest'
}

export interface StickyNote {
  id: string
  text: string
  author: string
  authorId: string
  position: Vec3
  color: string
  createdAt: number
}

export interface RoomSnapshot {
  roomId: string
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<SeatId, string | null>
  furniture: FurnitureItem[]
}

export type { FurnitureItem }
