import raw from '../data/heightlab.json'
import { SPAWN_POINTS } from './dungeon.ts'
import { groundY, parseHeightField, type HeightField } from './heightfield.ts'

const HEIGHTLAB = parseHeightField(raw)

/** 沒有高度圖的地圖（kenney / kaykit / jungle）回 null，碰撞維持原本的平面格子。 */
export function heightFieldOf(scene?: string | null): HeightField | null {
  if (scene === 'heightlab') return HEIGHTLAB
  return null
}

export function spawnOf(scene: string | null | undefined, index: number) {
  const field = heightFieldOf(scene)
  if (field?.spawns.length) {
    const s = field.spawns[index % field.spawns.length]
    return { x: s.x, y: groundY(field, s.x, s.z) ?? s.y ?? 0, z: s.z }
  }
  const sp = SPAWN_POINTS[index % SPAWN_POINTS.length]
  return { x: sp.x, y: 0, z: sp.z }
}
