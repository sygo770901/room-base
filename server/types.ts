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
  weapon?: 'sword' | 'dagger' | 'hammer'
  weaponUntil?: number
  away?: boolean
  phrase?: { text: string; until: number } | null
  downedUntil?: number
  /** 這次倒地的開始時間。重生按鈕用它算滿 5 秒，不靠剩餘時間倒推。 */
  downedAt?: number
  /** 客戶端正在播的步態。遠端用這個播走路／跑步，不靠延遲的位置差分。 */
  loco?: 'idle' | 'walk' | 'run'
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
