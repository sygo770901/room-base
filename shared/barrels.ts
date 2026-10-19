import { FLOOR_CENTERS, HIDE_SPOTS, SPAWN_POINTS } from './dungeon.ts'

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

const chosen: { x: number; z: number }[] = []
for (const c of FLOOR_CENTERS) {
  if (chosen.length >= BARREL_COUNT) break
  if (!far(c.x, c.z, HIDE_SPOTS, 2.4)) continue
  if (!far(c.x, c.z, SPAWN_POINTS, 4)) continue
  if (!far(c.x, c.z, chosen, 6)) continue
  chosen.push({ x: c.x + 0.4, z: c.z - 0.35 })
}
while (chosen.length < BARREL_COUNT && FLOOR_CENTERS.length) {
  const c = FLOOR_CENTERS[(chosen.length * 7) % FLOOR_CENTERS.length]
  chosen.push({ x: c.x, z: c.z })
}

export const BARREL_SPOTS = chosen.slice(0, BARREL_COUNT)

export function createBarrels(): BarrelState[] {
  return BARREL_SPOTS.map((p, i) => ({
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
