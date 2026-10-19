export const MODE_IDS = ['hunt', 'boss'] as const

export type GameMode = (typeof MODE_IDS)[number]

export const MODE_LABELS: Record<GameMode, string> = {
  hunt: '地城狩獵',
  boss: '最終BOSS戰',
}

export const MODE_BLURBS: Record<GameMode, string> = {
  hunt: '原本的躲貓貓加打怪。地圖上有騎士、蠻族、盜賊、法師。',
  boss: '地圖上只有鴨大王和他的飲水機寵物。誰先把兩隻都打倒，誰就贏。',
}

export function isGameMode(value: unknown): value is GameMode {
  return value === 'hunt' || value === 'boss'
}
