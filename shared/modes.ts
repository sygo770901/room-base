export const MODE_IDS = ['hunt', 'boss', 'tag'] as const

export type GameMode = (typeof MODE_IDS)[number]

export const MODE_LABELS: Record<GameMode | 'tag', string> = {
  hunt: '地城狩獵',
  boss: '打鴨王',
  tag: '鬼抓人',
}

export const MODE_BLURBS: Record<GameMode | 'tag', string> = {
  hunt: '打怪、躲藏。',
  boss: '全隊打倒鴨王。',
  tag: '躲起來，別被抓。',
}

export type TimeLimit = 0 | 300

export interface RoomSettings {
  timed: boolean
  timeLimitSec: TimeLimit
}

export function isGameMode(value: unknown): value is GameMode {
  return value === 'hunt' || value === 'boss' || value === 'tag'
}

export function defaultSettings(): RoomSettings {
  return { timed: false, timeLimitSec: 0 }
}
