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

export function dashCooldownMs(team?: string | null) {
  return team === 'ghost' ? DASH_CD_GHOST_MS : DASH_CD_MS
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
  let vert = MOVE_Y_PAD
  if (grant?.dashUntil && now <= grant.dashUntil) {
    horiz += DASH_DISTANCE * MOVE_SLACK
  }
  if (grant?.jumpUntil && now <= grant.jumpUntil) {
    vert += JUMP_MAX_DELTA
  }
  return { horiz, vert, dt }
}
