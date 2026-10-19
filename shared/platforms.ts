/** 跳躍與平台（先定，昱豪可改）。牆頂不可站。 */
export const GRAVITY = 20
export const JUMP_SPEED = 9.2
export const LAND_SNAP = 0.32
export const HIDE_MAX_Y = 0.4

export type Platform = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  topY: number
}

export const KAYKIT_PLATFORMS: Platform[] = [
  { minX: 64.9, maxX: 67.1, minZ: 24.85, maxZ: 27.15, topY: 2.12 },
  { minX: 94.9, maxX: 97.1, minZ: 116.85, maxZ: 119.15, topY: 2.12 },
  { minX: 51.8, maxX: 54.0, minZ: 21.85, maxZ: 24.15, topY: 2.12 },
  { minX: 133.85, maxX: 136.05, minZ: 121.85, maxZ: 124.15, topY: 2.12 },
]

export function platformsFor(scene?: string | null): Platform[] {
  return scene === 'kaykit' ? KAYKIT_PLATFORMS : []
}

function onTop(x: number, z: number, radius: number, p: Platform) {
  return x + radius > p.minX && x - radius < p.maxX && z + radius > p.minZ && z - radius < p.maxZ
}

export function supportY(
  x: number,
  z: number,
  y: number,
  prevY: number,
  radius: number,
  platforms: Platform[],
) {
  let best = 0
  for (const p of platforms) {
    if (!onTop(x, z, radius, p)) continue
    const crossed = prevY >= p.topY - 0.02 && y <= p.topY + LAND_SNAP
    const near = y + LAND_SNAP >= p.topY && y <= p.topY + 0.55
    if (crossed || near) {
      if (p.topY > best) best = p.topY
    }
  }
  return best
}

export function blocksAtHeight(x: number, z: number, y: number, radius: number, platforms: Platform[]) {
  for (const p of platforms) {
    if (y + 0.12 >= p.topY) continue
    if (onTop(x, z, radius, p)) return true
  }
  return false
}
