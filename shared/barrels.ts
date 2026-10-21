import { FLOOR_CENTERS, HIDE_SPOTS, SPAWN_POINTS, isWalkableWorld } from './dungeon.ts'
import { heightFieldOf } from './heightmaps.ts'
import { extraAabbsOf } from './mapData.ts'

/** 木桶與掉寶數值。先定，方便日後調整。 */
export const BARREL_COUNT = 20
export const BARREL_HP = 60
export const BARREL_RADIUS = 0.55
export const BARREL_SHARD_MS = 2000
export const DROP_TTL_MS = 30_000
export const BARREL_RESPAWN_MS = 60_000
export const WEAPON_TTL_MS = 60_000
export const HEAL_POTION = 35
export const PICKUP_RANGE = 1.05

export type HeldWeapon = 'sword' | 'dagger' | 'hammer'
export type DropKind = 'heal' | 'dagger' | 'hammer'

export const WEAPON_STATS: Record<HeldWeapon, { damage: number; cooldown: number; range: number; cos: number; speed: number }> = {
  sword: { damage: 34, cooldown: 460, range: 2.5, cos: Math.cos(1.15), speed: 1 },
  dagger: { damage: 18, cooldown: 250, range: 2, cos: Math.cos(1.15), speed: 1.05 },
  hammer: { damage: 70, cooldown: 1000, range: 2.8, cos: Math.cos(1.45), speed: 1 },
}

export type BarrelState = {
  id: string
  x: number
  z: number
  hp: number
  alive: boolean
  respawnAt: number
}

export type LootDrop = {
  id: string
  x: number
  z: number
  kind: DropKind
  until: number
}

function far(x: number, z: number, pts: { x: number; z: number }[], d: number) {
  return pts.every((p) => Math.hypot(p.x - x, p.z - z) >= d)
}

function overlapsWall(x: number, z: number, r: number, boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[]) {
  return boxes.some((b) => x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ)
}

export function barrelSpotsOf(scene?: string | null) {
  if (heightFieldOf(scene)) return []
  const extra = extraAabbsOf(scene)
  const pad = BARREL_RADIUS + 0.2
  const spots: { x: number; z: number }[] = []
  const tryPut = (x: number, z: number, minGap: number) => {
    if (spots.length >= BARREL_COUNT) return
    if (!isWalkableWorld(x, z, pad)) return
    if (overlapsWall(x, z, pad, extra)) return
    if (!far(x, z, HIDE_SPOTS, 2.4)) return
    if (!far(x, z, SPAWN_POINTS, 4)) return
    if (!far(x, z, spots, minGap)) return
    spots.push({ x, z })
  }
  for (const c of FLOOR_CENTERS) tryPut(c.x, c.z, 6)
  for (const c of FLOOR_CENTERS) tryPut(c.x, c.z, 3.2)
  return spots.slice(0, BARREL_COUNT)
}

export const BARREL_SPOTS = barrelSpotsOf('kenney')

export function createBarrels(scene?: string | null): BarrelState[] {
  return barrelSpotsOf(scene).map((p, i) => ({
    id: `barrel-${i}`,
    x: p.x,
    z: p.z,
    hp: BARREL_HP,
    alive: true,
    respawnAt: 0,
  }))
}

export function rollDrop(): DropKind | null {
  const n = Math.random()
  if (n < 0.4) return 'heal'
  if (n < 0.55) return 'dagger'
  if (n < 0.7) return 'hammer'
  return null
}
