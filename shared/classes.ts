export const CLASS_IDS = ['knight', 'barbarian', 'rogue', 'mage', 'ranger'] as const

export type ClassId = (typeof CLASS_IDS)[number]

/** 開房不再選職業。所有玩家都用這個較瘦的遊俠，右手單手劍。 */
export const PLAYER_CLASS: ClassId = 'ranger'

export const CLASS_LABELS: Record<ClassId, string> = {
  knight: '騎士',
  barbarian: '蠻族',
  rogue: '盜賊',
  mage: '法師',
  ranger: '遊俠',
}

export const CLASS_BLURBS: Record<ClassId, string> = {
  knight: '盔甲與單手劍',
  barbarian: '斧與肩甲',
  rogue: '匕首與頭巾',
  mage: '法袍與法杖',
  ranger: '較瘦的遊俠，單手劍',
}

export function isClassId(value: unknown): value is ClassId {
  return (
    value === 'knight' ||
    value === 'barbarian' ||
    value === 'rogue' ||
    value === 'mage' ||
    value === 'ranger'
  )
}
