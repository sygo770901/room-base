import { MAP_WORLD } from './dungeon.ts'
import { heightFieldOf } from './heightmaps.ts'

export type MapBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

/** 這張圖實際載入的範圍。平面圖是整座地城，高度圖是自己的格子，不是高度試驗那一小塊。 */
export function worldBoundsOf(scene?: string | null): MapBounds {
  const field = heightFieldOf(scene)
  if (field) {
    return {
      minX: field.originX,
      maxX: field.originX + field.cols * field.cell,
      minZ: field.originZ,
      maxZ: field.originZ + field.rows * field.cell,
    }
  }
  return { ...MAP_WORLD }
}

/** 俯視整個載入範圍。垂直視野 58°、畫面 16:9，距離剛好框住整張圖。 */
export function overviewShot(scene?: string | null, fovDeg = 58, aspect = 16 / 9) {
  const b = worldBoundsOf(scene)
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const spanX = Math.max(1, b.maxX - b.minX)
  const spanZ = Math.max(1, b.maxZ - b.minZ)
  const halfFov = (fovDeg * Math.PI) / 180 / 2
  const tan = Math.tan(halfFov)
  const distZ = spanZ / 2 / tan
  const distX = spanX / 2 / (tan * aspect)
  const y = Math.max(distZ, distX) * 1.08 + 2
  return {
    pos: [cx, y, cz] as [number, number, number],
    look: [cx, 0, cz] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    far: y + Math.hypot(spanX, spanZ) + 40,
    bounds: b,
  }
}
