/** 煙霧彈數值。最遠 12，伺服器再夾一次。 */
export const SMOKE_RANGE = 12
export const SMOKE_RANGE_MOBILE = 12
export const SMOKE_RADIUS = 4.5
export const SMOKE_DURATION_MS = 6000
export const SMOKE_DURATION_TAG_MS = 6000
export const SMOKE_CD_MS = 5000
export const SMOKE_CD_GHOST_MS = 5000
/** 扔大便飛行／中招（先定，昱豪可改） */
export const POOP_FLIGHT_MS = 560
export const POOP_SLOW_MS = 1000
/** 鬼抓人減速 30%。 */
export const POOP_SLOW_MUL = 0.7
export const POOP_SLOW_IMMUNE_MS = 4000
export const POOP_VIGNETTE_MS = 2000
export const POOP_FLIES_MS = 3000
export const POOP_ZONE_DPS = 5
export const POOP_STICK_DPS = 8
export const POOP_STICK_MS = 4000
export const POOP_DIRECT_RADIUS = 0.9

export type PoopStick = { id: string; until: number }

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
  sticks?: PoopStick[]
  /** 伺服器累積小數傷害，不送給客戶端。 */
  dmgBank?: Record<string, number>
}

export function smokeDurationMs(mode?: string | null) {
  return mode === 'tag' ? SMOKE_DURATION_TAG_MS : SMOKE_DURATION_MS
}

/** 臭氣從落地起算，不從丟出起算。 */
export function smokeSchedule(thrownAt: number, mode?: string | null) {
  const landAt = thrownAt + POOP_FLIGHT_MS
  return { landAt, until: landAt + smokeDurationMs(mode) }
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
    sticks: sticksForViewer(cloud.sticks, viewer, mode),
  }
}

/** 鬼抓人只讓鬼看到自己黏住了，避免從名單知道誰中招。 */
export function sticksForViewer(
  sticks: PoopStick[] | undefined,
  viewer: { id: string; team?: string | null },
  mode?: string | null,
): PoopStick[] {
  const live = (sticks ?? []).filter((s) => s.until > 0)
  if (mode === 'tag' && viewer.team === 'ghost') return live.filter((s) => s.id === viewer.id)
  return live
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

export function clampSmokeLanding(ox: number, oz: number, tx: number, tz: number, max = SMOKE_RANGE) {
  let x = Number.isFinite(tx) ? tx : ox
  let z = Number.isFinite(tz) ? tz : oz
  const dx = x - ox
  const dz = z - oz
  const dist = Math.hypot(dx, dz)
  if (dist > max && dist > 0) {
    x = ox + (dx / dist) * max
    z = oz + (dz / dist) * max
  }
  return { x, z }
}

export function poopArcPoints(ox: number, oz: number, y0: number, tx: number, tz: number, y1: number, steps = 12) {
  const pts: { x: number; y: number; z: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({
      x: ox + (tx - ox) * t,
      z: oz + (tz - oz) * t,
      y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 2.1,
    })
  }
  return pts
}

/** 新的一發只刷新同一層黏附，不會疊第二層。 */
export function refreshPoopStick(sticks: PoopStick[] | undefined, id: string, now: number) {
  const next = (sticks ?? []).filter((s) => s.id !== id && s.until > now)
  next.push({ id, until: now + POOP_STICK_MS })
  return next
}

export type RoomStick = { until: number; by?: string }
export type RoomSticks = Record<string, RoomStick>

/** 全房一個目標只留一層黏附。換人再打到只刷新這層。 */
export function refreshRoomStick(sticks: RoomSticks | undefined, id: string, now: number, by?: string): RoomSticks {
  return { ...(sticks ?? {}), [id]: { until: now + POOP_STICK_MS, by } }
}

/** 重疊的臭氣區與多個丟擲者都只結算一次。黏著 8，否則在區內 5。 */
export function poopExposure(input: { stuck: boolean; zones: number; mode?: string | null }) {
  const zones = Math.max(0, Math.floor(input.zones))
  if (input.mode === 'tag') return { stuck: input.stuck, zones, dps: 0 }
  if (input.stuck) return { stuck: true, zones, dps: POOP_STICK_DPS }
  if (zones > 0) return { stuck: false, zones, dps: POOP_ZONE_DPS }
  return { stuck: false, zones: 0, dps: 0 }
}

export function roomStickList(sticks: RoomSticks | undefined, now: number): PoopStick[] {
  return Object.entries(sticks ?? {})
    .filter(([, stick]) => stick.until > now)
    .map(([id, stick]) => ({ id, until: stick.until }))
}

/** 把房間級黏附掛到同步用的雲上。雲都散了仍留一筆不繪製的載體，標記才看得到。 */
export function publishSmokes(
  clouds: SmokeCloud[] | undefined,
  sticks: RoomSticks | undefined,
  viewer: { id: string; team?: string | null },
  mode: string | null | undefined,
  now: number,
): SmokeCloud[] {
  const list = roomStickList(sticks, now)
  const live = liveSmokes(clouds, now).map((cloud) => ({ ...cloud, sticks: list }))
  const out = live.map((cloud) => publicSmokeForViewer(cloud, viewer, mode))
  if (out.length || list.length === 0) return out
  const carrier = publicSmokeForViewer(
    { id: 'poop-sticks', x: 0, z: 0, r: 0, until: Math.max(...list.map((s) => s.until)), sticks: list },
    viewer,
    mode,
  )
  return carrier.sticks?.length ? [carrier] : []
}

export function poopDamageThisTick(stuck: boolean, dtSec: number, mode?: string | null) {
  if (mode === 'tag') return 0
  return (stuck ? POOP_STICK_DPS : POOP_ZONE_DPS) * Math.max(0, dtSec)
}

export function bankPoopDamage(bank: number, stuck: boolean, dtSec: number, mode?: string | null) {
  const next = bank + poopDamageThisTick(stuck, dtSec, mode)
  const dealt = Math.floor(next + 1e-9)
  return { bank: next - dealt, dealt }
}

/** 鬼抓人用減速取代傷害。減速是 30%，不疊加。 */
export function tagSlowMul(mode: string | null | undefined, affected: boolean) {
  if (mode !== 'tag' || !affected) return 1
  return POOP_SLOW_MUL
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
