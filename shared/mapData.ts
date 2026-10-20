import { KAYKIT_EXTRA_WALLS, KAYKIT_OCCLUDERS } from './kaykitScene'
import { platformsFor } from './platforms'
import type { WallBox, OccBox } from './dungeon'
import type { SceneId } from './scenes'
import type { DoorDef } from './doors'

/** 三張地圖共用地城通道，但門清單各自一份，加新地圖只改這裡。 */
const KENNEY_DOORS: DoorDef[] = [
  { id: 'door-enter', x: 78, z: 34, rotY: 0 },
  { id: 'door-chapel', x: 78, z: 106, rotY: 0 },
  { id: 'door-west', x: 30, z: 66, rotY: 0 },
  { id: 'door-library', x: 134, z: 70, rotY: 0 },
  { id: 'door-vault', x: 116, z: 28, rotY: Math.PI / 2 },
  { id: 'door-boss', x: 134, z: 114, rotY: 0 },
]

function copyDoors(base: DoorDef[]): DoorDef[] {
  return base.map((d) => ({ ...d }))
}

const KAYKIT_DOORS: DoorDef[] = copyDoors(KENNEY_DOORS)
const JUNGLE_DOORS: DoorDef[] = copyDoors(KENNEY_DOORS)

export function doorsOf(scene?: SceneId | string | null): DoorDef[] {
  if (scene === 'kaykit') return KAYKIT_DOORS
  if (scene === 'jungle') return JUNGLE_DOORS
  return KENNEY_DOORS
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
