export type Vec3 = [number, number, number]

export interface FurnitureItem {
  id: string
  model: string
  position: Vec3
  rotationY: number
  scale: number
  color: string
  collider: [number, number] | null
  draggable: boolean
  pushable: boolean
  seat?: string
}

export const LAYOUT_VERSION = 5
export const PLAYER_RADIUS = 0.26

export type { WallBox } from './dungeon'
export { ROOM_BOUNDS, ALL_BLOCKERS as INNER_WALLS } from './dungeon'

/** 地城本體是靜態場景，不再用可拖家具當牆。 */
export const DEFAULT_FURNITURE: FurnitureItem[] = []
