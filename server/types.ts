import type { ClassId } from '../shared/classes.ts'

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
  team?: 'ghost' | 'hider' | 'spectator'
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
