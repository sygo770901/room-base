/** 快捷語（先定，昱豪可改）。 */
export const QUICK_PHRASES = ['這邊！', '救我！', '鴨王在這', '好喔', '哈哈哈', 'GG'] as const
export const PHRASE_DURATION_MS = 3000
export const PHRASE_COOLDOWN_MS = 2000

export function phraseAt(index: number) {
  return QUICK_PHRASES[index] ?? null
}
