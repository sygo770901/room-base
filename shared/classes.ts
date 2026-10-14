export const CLASS_IDS = ['knight', 'barbarian', 'rogue', 'mage'] as const

export type ClassId = (typeof CLASS_IDS)[number]

export const CLASS_LABELS: Record<ClassId, string> = {
  knight: '騎士',
  barbarian: '蠻族',
  rogue: '盜賊',
  mage: '法師',
}

export const CLASS_BLURBS: Record<ClassId, string> = {
  knight: '盔甲與單手劍',
  barbarian: '斧與肩甲',
  rogue: '匕首與頭巾',
  mage: '法袍與法杖',
}

export function isClassId(value: unknown): value is ClassId {
  return value === 'knight' || value === 'barbarian' || value === 'rogue' || value === 'mage'
}
