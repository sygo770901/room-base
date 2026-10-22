import { canMoveTo, groundY } from './heightfield.ts'
import { heightFieldOf } from './heightmaps.ts'
import { sampleSolidHit } from './sampleRoom.ts'

/**
 * 寶物房高度圖不管寶箱和門柱。沿著這一步每 0.2m 看一次地面和實心物體。
 * 沒在跳時腳高用該點的地面；跳躍時用腳的高度，矮道具可以越過去。
 */
export function samplePathClear(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
  feetY0?: number,
  feetY1?: number,
) {
  const field = heightFieldOf('sample')
  if (!field) return true
  const dist = Math.hypot(x1 - x0, z1 - z0)
  const steps = Math.max(1, Math.ceil(dist / 0.2))
  const airborne = feetY0 != null
  const feetEnd = feetY1 ?? feetY0 ?? 0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const z = z0 + (z1 - z0) * t
    const gy = groundY(field, x, z)
    if (gy == null) return false
    const feet = airborne ? (feetY0 as number) + (feetEnd - (feetY0 as number)) * t : gy
    if (sampleSolidHit(x, z, feet, radius)) return false
  }
  return true
}

export function sampleCanStep(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
) {
  const field = heightFieldOf('sample')
  if (!field) return false
  if (!canMoveTo(field, x0, z0, x1, z1, radius)) return false
  return samplePathClear(x0, z0, x1, z1, radius)
}
