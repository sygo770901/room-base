import { POOP_SLOW_MUL } from './smoke.ts'

/** 與客戶端走路速度相同。之後衝刺／跳躍加在 allowance 上，不必重寫判定。 */
export const PLAYER_SPEED = 5.2
export const MOVE_SLACK = 1.3
export const MOVE_PAD = 0.3
/**
 * 用來算允許距離的時間上限（秒）。
 * 站著不動不再讓允許距離無限變大；0.8 夠涵蓋約 300ms 延遲＋掉包，
 * 但 10 秒／60 秒後送 20 單位外的座標仍會被拒。
 */
export const MOVE_DT_CAP_SEC = 0.8
/** 高度容差。之後跳躍會另外加上 JUMP_MAX_DELTA。 */
export const MOVE_Y_PAD = 0.35
/** 第 5 項衝刺：0.2 秒衝 4 格。數字先定，方便日後調整。 */
export const DASH_DISTANCE = 4
export const DASH_DURATION_MS = 200
export const DASH_CD_MS = 4000
export const DASH_CD_GHOST_MS = 6000
export const DASH_IFRAME_MS = 200
/** 按住超過這段時間才算衝刺；更短的一下仍走原本的短衝。 */
export const DASH_TAP_MS = 200
/** 按住衝刺：移動速度 1.3 倍，最長 5 秒，結束後冷卻 5 秒。沒有無敵。 */
export const SPRINT_MUL = 1.3
export const SPRINT_MAX_MS = 5000
export const SPRINT_CD_MS = 5000

export function dashCooldownMs(team?: string | null) {
  return team === 'ghost' ? DASH_CD_GHOST_MS : DASH_CD_MS
}

/** 點一下短衝的時間。數值和原本的 dash 事件相同。 */
export function tapDashTiming(now: number, team?: string | null) {
  return {
    until: now + DASH_DURATION_MS,
    nextAt: now + dashCooldownMs(team),
    iframeUntil: now + DASH_IFRAME_MS,
  }
}

export type SprintClock = {
  sprintHoldStart?: number
  sprintHoldEnd?: number
}

/** [t0, t1) 裡衝刺生效的毫秒。結束點不含，滿 5 秒當下速度已回到 1 倍。 */
export function sprintActiveMs(grant: SprintClock | undefined, t0: number, t1: number) {
  if (!grant?.sprintHoldStart || t1 <= t0) return 0
  const cap = grant.sprintHoldStart + SPRINT_MAX_MS
  const end = grant.sprintHoldEnd != null ? Math.min(grant.sprintHoldEnd, cap) : cap
  const a = Math.max(t0, grant.sprintHoldStart)
  const b = Math.min(t1, end)
  return Math.max(0, b - a)
}

export function isSprintActive(grant: SprintClock | undefined, now: number) {
  return sprintActiveMs(grant, now, now + 1) > 0
}

export function sprintSpeedMul(grant: SprintClock | undefined, now: number) {
  return isSprintActive(grant, now) ? SPRINT_MUL : 1
}

/** 按住已滿 5 秒就收掉，冷卻從收掉的那一刻起算。 */
export function expireSprint(grant: SprintClock | undefined, now: number) {
  if (!grant?.sprintHoldStart || grant.sprintHoldEnd != null) return null
  const cap = grant.sprintHoldStart + SPRINT_MAX_MS
  if (now < cap) return null
  grant.sprintHoldEnd = cap
  return { holdEnd: cap, nextAt: cap + SPRINT_CD_MS }
}

export function dashCoolingDown(nextAt: number, now: number) {
  return now < nextAt
}

export function beginSprint(nextAt: number, grant: SprintClock | undefined, now: number) {
  if (dashCoolingDown(nextAt, now)) return { ok: false as const, reason: 'cd' as const, nextAt }
  if (isSprintActive(grant, now)) {
    return { ok: true as const, fresh: false as const, holdStart: grant?.sprintHoldStart ?? now }
  }
  return { ok: true as const, fresh: true as const, holdStart: now }
}

/** 提早放開：冷卻從放開起算 5 秒。已經因為滿 5 秒收掉的，不再把冷卻往後延。 */
export function endSprint(grant: SprintClock | undefined, now: number) {
  const start = grant?.sprintHoldStart
  if (!start) return null
  const cap = start + SPRINT_MAX_MS
  const end = grant?.sprintHoldEnd != null ? Math.min(grant.sprintHoldEnd, cap) : Math.min(now, cap)
  return { holdEnd: end, nextAt: end + SPRINT_CD_MS }
}
/** 第 11 項跳躍預留的單次高度預算。 */
export const JUMP_MAX_DELTA = 2.4
export const JUMP_AIR_MS = 1100
export const JUMP_CEILING = 2.6

/** 既有地圖維持 2.6。寶物房樣本要走上高台，只放寬這一張。 */
export function jumpCeilingFor(scene?: string | null) {
  return scene === 'sample' ? 8.2 : JUMP_CEILING
}

export type MoveGrant = {
  dashUntil?: number
  jumpUntil?: number
  sprintHoldStart?: number
  sprintHoldEnd?: number
}

export function cappedMoveDt(elapsedMs: number) {
  return Math.min(Math.max(0, elapsedMs) / 1000, MOVE_DT_CAP_SEC)
}

export function moveAllowance(
  elapsedMs: number,
  grant: MoveGrant | undefined,
  now: number,
  opts?: { poopSlow?: boolean; poopMul?: number },
) {
  const dt = cappedMoveDt(elapsedMs)
  const mul = opts?.poopSlow ? (opts.poopMul ?? POOP_SLOW_MUL) : 1
  let horiz = opts?.poopSlow ? PLAYER_SPEED * mul * dt + 0.08 : PLAYER_SPEED * dt * MOVE_SLACK + MOVE_PAD
  const sprintMs = sprintActiveMs(grant, now - dt * 1000, now)
  if (sprintMs > 0 && dt > 0) {
    const normalSec = dt - sprintMs / 1000
    const sprintSec = sprintMs / 1000
    const blend = normalSec + sprintSec * SPRINT_MUL
    horiz = opts?.poopSlow ? PLAYER_SPEED * mul * blend + 0.08 : PLAYER_SPEED * MOVE_SLACK * blend + MOVE_PAD
  }
  let vert = MOVE_Y_PAD
  if (grant?.dashUntil && now <= grant.dashUntil) {
    horiz += DASH_DISTANCE * MOVE_SLACK
  }
  if (grant?.jumpUntil && now <= grant.jumpUntil) {
    vert += JUMP_MAX_DELTA
  }
  return { horiz, vert, dt }
}
