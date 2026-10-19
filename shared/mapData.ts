import { KAYKIT_EXTRA_WALLS, KAYKIT_OCCLUDERS } from './kaykitScene'
import { platformsFor } from './platforms'
import type { WallBox, OccBox } from './dungeon'
import type { SceneId } from './scenes'

/** 叢林樹幹碰撞。加地圖時在這裡加資料即可。 */
const JUNGLE_TRUNKS: WallBox[] = [
  { cx: 50, cz: 40, hx: 0.45, hz: 0.45 },
  { cx: 90, cz: 48, hx: 0.5, hz: 0.5 },
  { cx: 70, cz: 88, hx: 0.42, hz: 0.42 },
  { cx: 118, cz: 72, hx: 0.48, hz: 0.48 },
  { cx: 42, cz: 96, hx: 0.4, hz: 0.4 },
  { cx: 102, cz: 36, hx: 0.46, hz: 0.46 },
  { cx: 60, cz: 120, hx: 0.5, hz: 0.5 },
  { cx: 148, cz: 90, hx: 0.44, hz: 0.44 },
]

function wallsToAabb(walls: WallBox[]) {
  return walls.map((w) => ({
    minX: w.cx - w.hx,
    maxX: w.cx + w.hx,
    minZ: w.cz - w.hz,
    maxZ: w.cz + w.hz,
    id: 'map',
  }))
}

export function extraWallsOf(scene?: SceneId | string | null): WallBox[] {
  if (scene === 'kaykit') return KAYKIT_EXTRA_WALLS
  if (scene === 'jungle') return KAYKIT_EXTRA_WALLS.concat(JUNGLE_TRUNKS)
  return []
}

export function extraAabbsOf(scene?: SceneId | string | null) {
  return wallsToAabb(extraWallsOf(scene))
}

export function occludersOf(scene?: SceneId | string | null): OccBox[] {
  if (scene === 'kaykit' || scene === 'jungle') return KAYKIT_OCCLUDERS
  return []
}

export function platformsOf(scene?: SceneId | string | null) {
  return platformsFor(scene)
}

export function usesKaykitKit(scene?: SceneId | string | null) {
  return scene === 'kaykit' || scene === 'jungle'
}

export const JUNGLE_TREE_SPOTS = JUNGLE_TRUNKS.map((t) => ({ x: t.cx, z: t.cz, r: t.hx }))
