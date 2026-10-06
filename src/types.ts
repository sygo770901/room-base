import type { FurnitureItem } from '../shared/furniture'

export type Vec3 = [number, number, number]
export type SeatId = string

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
  fontSize: number
  createdAt: number
}

export interface RoomSnapshot {
  roomId: string
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
}

export type { FurnitureItem }
