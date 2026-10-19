/** 煙霧彈數值。先定，方便日後調整。 */
export const SMOKE_RANGE = 8
export const SMOKE_RANGE_MOBILE = 6
export const SMOKE_RADIUS = 3
export const SMOKE_DURATION_MS = 4000
export const SMOKE_CD_MS = 15000
export const SMOKE_CD_GHOST_MS = 20000

export type SmokeCloud = {
  id: string
  x: number
  z: number
  r: number
  until: number
}

export function smokeCooldownMs(team?: string | null) {
  return team === 'ghost' ? SMOKE_CD_GHOST_MS : SMOKE_CD_MS
}

export function liveSmokes(clouds: SmokeCloud[] | undefined, now: number) {
  return (clouds ?? []).filter((c) => c.until > now)
}

export function inSmoke(clouds: SmokeCloud[] | undefined, x: number, z: number, now: number) {
  return liveSmokes(clouds, now).some((c) => Math.hypot(c.x - x, c.z - z) <= c.r)
}

function segHitsCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number) {
  const abx = bx - ax
  const abz = bz - az
  const t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cz - az) * abz) / (abx * abx + abz * abz || 1)))
  const px = ax + abx * t
  const pz = az + abz * t
  return Math.hypot(px - cx, pz - cz) <= r
}

export function smokeBlocks(
  clouds: SmokeCloud[] | undefined,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  now: number,
) {
  return liveSmokes(clouds, now).some((c) => segHitsCircle(ax, az, bx, bz, c.x, c.z, c.r))
}

export function smokeHidesFrom(
  clouds: SmokeCloud[] | undefined,
  viewer: { x: number; z: number },
  target: { x: number; z: number },
  now: number,
) {
  if (inSmoke(clouds, target.x, target.z, now)) return true
  return smokeBlocks(clouds, viewer.x, viewer.z, target.x, target.z, now)
}
