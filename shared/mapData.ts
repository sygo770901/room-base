import { KAYKIT_DOORWAYS, KAYKIT_EXTRA_WALLS, KAYKIT_OCCLUDERS } from './kaykitScene'
import { DOORWAY_DEFS, doorwayPlaces } from './doorways'
import { platformsFor } from './platforms'
import type { WallBox, OccBox } from './dungeon'
import type { SceneId } from './scenes'
import type { DoorDef } from './doors'

function copyDoors(): DoorDef[] {
  return DOORWAY_DEFS.map((d) => ({ ...d }))
}

const KENNEY_DOORS: DoorDef[] = copyDoors()
const KAYKIT_DOORS: DoorDef[] = copyDoors()
const JUNGLE_DOORS: DoorDef[] = copyDoors()

export function doorsOf(scene?: SceneId | string | null): DoorDef[] {
  if (scene === 'kaykit') return KAYKIT_DOORS
  if (scene === 'jungle') return JUNGLE_DOORS
  return KENNEY_DOORS
}

/** 門口模型位置。Kenney 用通道座標，KayKit／叢林用 wall_doorway。 */
export function doorwayModelsOf(scene?: SceneId | string | null) {
  if (scene === 'kaykit' || scene === 'jungle') {
    return KAYKIT_DOORWAYS.map((p) => ({ x: p.x, z: p.z, rotY: p.rotY }))
  }
  return doorwayPlaces()
}

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
