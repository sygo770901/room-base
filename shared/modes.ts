export const MODE_IDS = ['hunt', 'boss'] as const

export type GameMode = (typeof MODE_IDS)[number]

export const MODE_LABELS: Record<GameMode | 'tag', string> = {
  hunt: '地城狩獵',
  boss: '打鴨王',
  tag: '鬼抓人',
}

export const MODE_BLURBS: Record<GameMode | 'tag', string> = {
  hunt: '原本的躲貓貓加打怪。地圖上有騎士、蠻族、盜賊、法師。',
  boss: '全隊一起打倒鴨大王和他的飲水機。',
  tag: '即將推出。躲的人藏起來，鬼去抓。',
}

export type TimeLimit = 0 | 300

export interface RoomSettings {
  timed: boolean
  timeLimitSec: TimeLimit
}

export function isGameMode(value: unknown): value is GameMode {
  return value === 'hunt' || value === 'boss'
}

export function defaultSettings(): RoomSettings {
  return { timed: false, timeLimitSec: 0 }
}
