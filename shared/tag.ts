export const TAG_HIDE_MS = 30_000
export const TAG_TOUCH = 0.9
export const TAG_CHECK_RANGE = 1.8
export const TAG_CHECK_CD_MS = 3000
export const TAG_BOX_MAX_MS = 45_000
export const TAG_BOX_REENTER_MS = 10_000
export const TAG_UNTIMED_CAP_MS = 15 * 60 * 1000
export const PLAYER_SPEED = 5.2
export const MOVE_SLACK = 1.3
export const MOVE_PAD = 0.3

export type TagTeam = 'ghost' | 'hider' | 'spectator'

export interface TagHud {
  hideLeftMs: number
  playLeftMs: number | null
  hidersLeft: number
  team: TagTeam | null
  nextCheckMs: number
  roundActive: boolean
}

export interface TagState {
  roundActive: boolean
  hideUntil: number
  playUntil: number | null
  timed: boolean
  catches: Record<string, number>
  caughtAt: Record<string, number>
  hideEnteredAt: Record<string, number>
  hideSpot: Record<string, string>
  hideCooldown: Record<string, { spotId: string; until: number }>
  nextCheck: Record<string, number>
  opened: boolean
}
