import { SAMPLE_PLATFORMS } from './sampleRoom'

/** 跳躍與平台（先定，昱豪可改）。牆頂不可站。 */
export const GRAVITY = 20
export const JUMP_SPEED = 9.2
export const LAND_SNAP = 0.32
export const HIDE_MAX_Y = 0.4
/** 離支撐面多近才算著地，才能再跳（先定，昱豪可改）。 */
export const JUMP_GROUND_EPS = 0.18
export const PLAYER_FOOT_RADIUS = 0.26

export function canStartJump(x: number, z: number, y: number, platforms: Platform[]) {
  const floor = supportY(x, z, y, y, PLAYER_FOOT_RADIUS, platforms)
  return y <= floor + JUMP_GROUND_EPS
}

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

export const JUNGLE_ROCKS: Platform[] = [
  { minX: 72.4, maxX: 75.2, minZ: 54.4, maxZ: 57.1, topY: 0.85 },
  { minX: 108.3, maxX: 111.1, minZ: 98.2, maxZ: 101.0, topY: 0.9 },
]

export function platformsFor(scene?: string | null): Platform[] {
  if (scene === 'sample') return SAMPLE_PLATFORMS
  if (scene === 'kaykit') return KAYKIT_PLATFORMS
  if (scene === 'jungle') return KAYKIT_PLATFORMS.concat(JUNGLE_ROCKS)
  return []
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
