/** 煙霧彈數值。先定，方便日後調整。 */
export const SMOKE_RANGE = 8
export const SMOKE_RANGE_MOBILE = 6
export const SMOKE_RADIUS = 3
export const SMOKE_DURATION_MS = 8000
export const SMOKE_DURATION_TAG_MS = 4000
export const SMOKE_CD_MS = 5000
export const SMOKE_CD_GHOST_MS = 5000
/** 扔大便飛行／中招（先定，昱豪可改） */
export const POOP_FLIGHT_MS = 560
export const POOP_SLOW_MS = 1000
export const POOP_SLOW_MUL = 0.75
export const POOP_SLOW_IMMUNE_MS = 4000
export const POOP_VIGNETTE_MS = 2000
export const POOP_FLIES_MS = 3000

export type SmokeCloud = {
  id: string
  x: number
  z: number
  r: number
  until: number
  ox?: number
  oz?: number
  thrownAt?: number
  landAt?: number
  hits?: string[]
  throwerId?: string
  resolved?: boolean
}

export function smokeDurationMs(mode?: string | null) {
  return mode === 'tag' ? SMOKE_DURATION_TAG_MS : SMOKE_DURATION_MS
}

export function publicSmokeForViewer(
  cloud: SmokeCloud,
  viewer: { id: string; team?: string | null },
  mode?: string | null,
): SmokeCloud {
  const isGhost = mode === 'tag' && viewer.team === 'ghost'
  const hideHits = mode === 'tag'
  const hits = cloud.hits ?? []
  return {
    id: cloud.id,
    x: cloud.x,
    z: cloud.z,
    r: cloud.r,
    until: cloud.until,
    thrownAt: cloud.thrownAt,
    landAt: cloud.landAt,
    ox: isGhost ? undefined : cloud.ox,
    oz: isGhost ? undefined : cloud.oz,
    hits: hideHits ? (hits.includes(viewer.id) ? [viewer.id] : []) : hits,
  }
}

export function alliesForPoop(throwerTeam: string | null | undefined, mode?: string | null) {
  if (mode === 'tag') return throwerTeam ?? ''
  return '__all_players__'
}

export function shouldPoopHitPlayer(
  throwerId: string,
  throwerTeam: string | null | undefined,
  target: { id: string; team?: string | null },
  mode?: string | null,
) {
  if (target.id === throwerId) return false
  if (mode === 'tag') return Boolean(target.team && throwerTeam && target.team !== throwerTeam)
  return false
}

export function smokeCooldownMs(team?: string | null) {
  return team === 'ghost' ? SMOKE_CD_GHOST_MS : SMOKE_CD_MS
}

let smokeSeq = 0

/** 煙霧編號不含丟擲者身分。 */
export function anonSmokeId(now = Date.now()) {
  smokeSeq = (smokeSeq + 1) % 1_000_000
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')
  return `smoke-${now.toString(36)}-${smokeSeq.toString(36)}-${rand}`
}

export function liveSmokes(clouds: SmokeCloud[] | undefined, now: number) {
  return (clouds ?? []).filter((c) => c.until > now)
}

export function landedSmokes(clouds: SmokeCloud[] | undefined, now: number) {
  return liveSmokes(clouds, now).filter((c) => !c.landAt || now >= c.landAt)
}

export function inSmoke(clouds: SmokeCloud[] | undefined, x: number, z: number, now: number) {
  return landedSmokes(clouds, now).some((c) => Math.hypot(c.x - x, c.z - z) <= c.r)
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
