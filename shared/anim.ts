/** 連擊只改動作，不改傷害與攻速（先定，昱豪可改） */
export const COMBO_RESET_MS = 900
export const COMBO_CLIP_NAMES = [
  'Melee_1H_Attack_Chop',
  'Melee_1H_Attack_Slice_Horizontal',
  'Melee_1H_Attack_Stab',
] as const
export const COMBO_LEN = COMBO_CLIP_NAMES.length

export type HitAnim = 'A' | 'B' | 'death'
export type JumpPhase = 'start' | 'idle' | 'land'

/** 倒地動畫只在活著→倒地那一刻播一次，之後停在最後一格。 */
export type DeathAnimPhase = 'play' | 'hold' | 'idle' | 'live'

export function deathAnimTrigger(wasDowned: boolean, downed: boolean): DeathAnimPhase {
  if (downed && !wasDowned) return 'play'
  if (!downed && wasDowned) return 'idle'
  if (downed) return 'hold'
  return 'live'
}

export function nextComboStep(prevStep: number, lastAt: number, now: number) {
  if (!lastAt || now - lastAt > COMBO_RESET_MS) return 0
  return (prevStep + 1) % COMBO_LEN
}
