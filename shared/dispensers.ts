import { DISPENSER_MIN_SPACING } from './combat.ts'
import { FLOOR_CENTERS } from './dungeon.ts'
import { groundY } from './heightfield.ts'
import { heightFieldOf } from './heightmaps.ts'

export { DISPENSER_MIN_SPACING }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 這張地圖上能站人的點。高度圖用格子中心，平面圖用原本的地板中心。 */
export function dispenserCandidates(scene?: string | null): { x: number; z: number }[] {
  const field = heightFieldOf(scene)
  if (field) {
    const out: { x: number; z: number }[] = []
    for (let cz = 0; cz < field.rows; cz++) {
      for (let cx = 0; cx < field.cols; cx++) {
        const x = field.originX + (cx + 0.5) * field.cell
        const z = field.originZ + (cz + 0.5) * field.cell
        if (groundY(field, x, z) != null) out.push({ x, z })
      }
    }
    return out
  }
  return FLOOR_CENTERS.map((p) => ({ x: p.x, z: p.z }))
}

export function dispenserPairDistance(points: { x: number; z: number }[]) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      best = Math.min(best, Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z))
    }
  }
  return best
}

function tooClose(x: number, z: number, others: { x: number; z: number }[], min: number) {
  return others.some((o) => Math.hypot(o.x - x, o.z - z) < min - 1e-6)
}

/**
 * 在地圖上找 count 個飲水機落點。seed 決定洗牌順序。
 * occupied 是已經站好的（含鴨王或其他飲水機），新點不會靠過去。
 */
export function placeDispensers(
  scene: string | null | undefined,
  count: number,
  seed: number,
  near?: { x: number; z: number },
  occupied: { x: number; z: number }[] = [],
  min = DISPENSER_MIN_SPACING,
): { x: number; z: number }[] {
  const pool = dispenserCandidates(scene)
  const rand = mulberry32(seed || 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const swap = pool[i]
    pool[i] = pool[j]
    pool[j] = swap
  }
  if (near) {
    pool.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z))
  }
  const placed: { x: number; z: number }[] = []
  for (const p of pool) {
    if (tooClose(p.x, p.z, occupied, min) || tooClose(p.x, p.z, placed, min)) continue
    placed.push(p)
    if (placed.length >= count) break
  }
  return placed
}

/** 已經疊在一起的點往外推開。伺服器拒步、客戶端畫面前都走這份。 */
export function relaxDispenserSpacing<T extends { x: number; z: number }>(points: T[], min = DISPENSER_MIN_SPACING): T[] {
  const out = points.map((p) => ({ ...p }))
  for (let iter = 0; iter < 24; iter++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x
        let dz = out[j].z - out[i].z
        let d = Math.hypot(dx, dz)
        if (d >= min) continue
        if (d < 1e-4) {
          const ang = (i + 1) * 2.399963 + (j + 1)
          dx = Math.cos(ang)
          dz = Math.sin(ang)
          d = 1
        }
        const push = (min - d) / 2
        out[i].x -= (dx / d) * push
        out[i].z -= (dz / d) * push
        out[j].x += (dx / d) * push
        out[j].z += (dz / d) * push
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

/**
 * 這一步會靠進別台飲水機時，停在間距邊緣。
 * 本來就疊在一起時，只允許往更開的方向走。
 */
export function clampDispenserStep(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  others: { x: number; z: number }[],
  min = DISPENSER_MIN_SPACING,
) {
  if (!tooClose(toX, toZ, others, min)) return { x: toX, z: toZ }
  const nearest = (x: number, z: number) => {
    let best = Number.POSITIVE_INFINITY
    for (const o of others) best = Math.min(best, Math.hypot(o.x - x, o.z - z))
    return best
  }
  if (tooClose(fromX, fromZ, others, min)) {
    if (nearest(toX, toZ) > nearest(fromX, fromZ) + 1e-4) return { x: toX, z: toZ }
    return { x: fromX, z: fromZ }
  }
  let lo = 0
  let hi = 1
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    const x = fromX + (toX - fromX) * mid
    const z = fromZ + (toZ - fromZ) * mid
    if (tooClose(x, z, others, min)) hi = mid
    else lo = mid
  }
  return { x: fromX + (toX - fromX) * lo, z: fromZ + (toZ - fromZ) * lo }
}
