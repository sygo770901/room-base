import type { ClassId } from '../shared/classes'
import type { DuckSpeech, MatchOver, MonsterState, ProjectileState } from '../shared/combat'
import type { FurnitureItem } from '../shared/furniture'
import type { GameMode, RoomSettings } from '../shared/modes'
import type { TagHud } from '../shared/tag'
import type { SceneId } from '../shared/scenes'
import type { BarrelState, LootDrop } from '../shared/barrels'
import type { SmokeCloud } from '../shared/smoke'
import type { DoorState } from '../shared/doors'
import type { FeedItem } from '../shared/events'

export type Vec3 = [number, number, number]
export type SeatId = string

export interface PlayerState {
  id: string
  name: string
  color: string
  classId: ClassId
  position?: Vec3
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

export interface RoomSnapshot {
  roomId: string
  scene: SceneId
  mode?: GameMode
  hostId: string | null
  players: Record<string, PlayerState>
  notes: StickyNote[]
  seats: Record<string, string | null>
  furniture: FurnitureItem[]
  monsters: MonsterState[]
  matchOver?: MatchOver | null
  settings?: RoomSettings
  timeLeftMs?: number | null
  startInMs?: number
  started?: boolean
  tagHud?: TagHud | null
  smokes?: SmokeCloud[]
  barrels?: BarrelState[]
  drops?: LootDrop[]
  projectiles?: ProjectileState[]
  doors?: DoorState[]
  duckSpeech?: DuckSpeech | null
  feed?: FeedItem[]
  selfId?: string
  error?: string
}

export type { MonsterState }

export type { FurnitureItem }
