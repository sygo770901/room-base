import type { ClassId } from '../shared/classes'
import type { MonsterState } from '../shared/combat'
import type { FurnitureItem } from '../shared/furniture'
import type { SceneId } from '../shared/scenes'

export type Vec3 = [number, number, number]
export type SeatId = string

export interface PlayerState {
  id: string
  name: string
  color: string
  classId: ClassId
  position: Vec3
  rotationY: number
  seated: SeatId | null
  role: 'host' | 'guest'
  hp: number
  hidden?: boolean
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
  scene: SceneId
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
  monsters: MonsterState[]
}

export type { MonsterState }

export type { FurnitureItem }
