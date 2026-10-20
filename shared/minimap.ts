import { MAP_WORLD } from './dungeon'

/** 打鴨王小地圖尺寸（先定，昱豪可改） */
export const MINIMAP_DESKTOP_PX = 140
export const MINIMAP_MOBILE_PX = 96
/** 鏡頭視野扇形（先定，昱豪可改） */
export const MINIMAP_FOV_RAD = 0.95
export const MINIMAP_FOV_REACH = 28

/**
 * 世界 +X 東、+Z 北。小地圖北朝上（canvas Y 向下，所以 z 要反過來）。
 */
export function worldToMinimap(x: number, z: number, size: number, pad: number) {
  const sx = (size - pad * 2) / (MAP_WORLD.maxX - MAP_WORLD.minX)
  const sz = (size - pad * 2) / (MAP_WORLD.maxZ - MAP_WORLD.minZ)
  const s = Math.min(sx, sz)
  return {
    x: pad + (x - MAP_WORLD.minX) * s,
    y: pad + (MAP_WORLD.maxZ - z) * s,
    s,
  }
}

/** canvas 角：0 朝右、順時針增加。前方 (fx,fz) 對應扇形中線。 */
export function minimapYawFromForward(fx: number, fz: number) {
  return Math.atan2(-fz, fx)
}

/** 北朝上時的扇形中心：π/2 − 世界 yaw（atan2(dx,dz)）。 */
export function northUpConeYaw(worldYaw: number) {
  return Math.PI / 2 - worldYaw
}

export function worldYawFromForward(fx: number, fz: number) {
  return Math.atan2(fx, fz)
}

/** 面朝朝上：地圖轉多少，讓目前面向變成畫面上方。 */
export function headingUpRotation(lookYawCanvas: number) {
  return -lookYawCanvas - Math.PI / 2
}

export const MINIMAP_HEADING_KEY = 'rb-minimap-heading'

export function readMinimapHeadingUp() {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(MINIMAP_HEADING_KEY) !== '0'
}

export function minimapStep(fromX: number, fromZ: number, toX: number, toZ: number, size: number, pad: number) {
  const a = worldToMinimap(fromX, fromZ, size, pad)
  const b = worldToMinimap(toX, toZ, size, pad)
  return { dx: b.x - a.x, dy: b.y - a.y }
}

export function coneAgreesWithMove(fx: number, fz: number, mx: number, mz: number) {
  const yaw = minimapYawFromForward(fx, fz)
  const moveYaw = minimapYawFromForward(mx, mz)
  let diff = moveYaw - yaw
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return Math.abs(diff) < Math.PI / 2
}

export function turnRightDelta(prevYaw: number, nextYaw: number) {
  let d = nextYaw - prevYaw
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
