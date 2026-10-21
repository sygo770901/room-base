import places from '../data/heightlab.places.json'
import type { Place } from './dungeon'
import { heightCameraBlocked, type HeightField } from './heightfield'

type Part = { model: string; x: number; y: number; z: number; rotY?: number; scale?: number }

/** 高度試驗地圖的 KayKit 零件。碰撞不看這份，看 data/heightlab.json。 */
export const HEIGHTLAB_PLACES: Place[] = (places.parts as Part[]).map((part) => ({
  x: part.x,
  y: part.y,
  z: part.z,
  rotY: part.rotY ?? 0,
  model: part.model,
  scale: part.scale,
}))

/** wall.gltf 的局部範圍。高度圖把 z=2 那一格標成地面，模型卻延伸到 z=2.5。 */
const WALL_LOCAL = { minX: -2, maxX: 2, minY: 0, maxY: 4, minZ: -0.5, maxZ: 0.5 }
/** 鏡頭要再離開牆面這麼遠，近裁面才不會埋進牆。 */
export const WALL_CAM_MARGIN = 0.12

function wallLocal(place: Place, x: number, y: number, z: number) {
  const cos = Math.cos(place.rotY)
  const sin = Math.sin(place.rotY)
  const dx = x - place.x
  const dz = z - place.z
  return {
    x: dx * cos - dz * sin,
    y: y - place.y,
    z: dx * sin + dz * cos,
  }
}

/** 這一點在牆模型（含一點餘裕）裡面。不看高度圖，高度圖和牆面差了半格。 */
export function heightWallBlocksPoint(x: number, y: number, z: number, margin = WALL_CAM_MARGIN) {
  for (const place of HEIGHTLAB_PLACES) {
    if (place.model !== 'wall.gltf') continue
    const local = wallLocal(place, x, y, z)
    if (
      local.x >= WALL_LOCAL.minX - margin &&
      local.x <= WALL_LOCAL.maxX + margin &&
      local.y >= WALL_LOCAL.minY - margin &&
      local.y <= WALL_LOCAL.maxY + margin &&
      local.z >= WALL_LOCAL.minZ - margin &&
      local.z <= WALL_LOCAL.maxZ + margin
    ) {
      return true
    }
  }
  return false
}

/** 胸口到鏡頭這段有沒有穿進牆模型。網格還沒載入時也用這份，避免第一幀站在牆裡。 */
export function heightWallBlocksSegment(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 0.04) return heightWallBlocksPoint(x1, y1, z1)
  const steps = Math.max(1, Math.ceil(dist / 0.2))
  for (let i = 1; i <= steps; i++) {
    const along = (dist * i) / steps
    // 人貼上終點牆時胸口會在牆的餘裕裡。身體這一截不算擋住，否則鏡頭會縮進身體。
    if (along < 1) continue
    const t = i / steps
    if (heightWallBlocksPoint(x0 + dx * t, y0 + dy * t, z0 + dz * t)) return true
  }
  return false
}

/** 高度圖實體或牆模型擋到。畫面和測試都走這條，不另外寫一套牆。 */
export function heightTerrainBlocked(
  field: HeightField,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  return heightCameraBlocked(field, x0, y0, z0, x1, y1, z1) || heightWallBlocksSegment(x0, y0, z0, x1, y1, z1)
}
