/** 打鴨王倒地救援（先定，昱豪可改）。 */
export const DOWNED_MS = 15_000
/** 全隊都倒、沒人能扶時，把剩餘時間收到這段。單人不用這條，跟 DOWNED_MS 一樣等 15 秒。 */
export const DOWNED_SOLO_MS = 3_000
/** 倒地後先留這段給隊友扶，之後才可以自己回出生點。 */
export const RESPAWN_UNLOCK_MS = 5_000
export const CORPSE_MS = 3_000
export const CORPSE_BLOCK_MS = 2_000
export const MATCH_WIN_DELAY_MS = 2_800
export const RESPAWN_FADE_MS = 450
export const RESCUE_RANGE = 1.5
export const RESCUE_HOLD_MS = 2000
export const RESCUE_HP = 40

export function isDowned(player: { downedUntil?: number | null }, now = Date.now()) {
  return Boolean(player.downedUntil && now < player.downedUntil)
}

/** 倒地滿 5 秒、15 秒視窗還沒走完，才可以要求回出生點。 */
export function respawnChoiceReady(
  player: { downedAt?: number | null; downedUntil?: number | null },
  now = Date.now(),
) {
  if (!isDowned(player, now)) return false
  const at = player.downedAt
  if (typeof at !== 'number' || !Number.isFinite(at)) return false
  return now - at >= RESPAWN_UNLOCK_MS
}

export function nearestDowned(
  selfId: string,
  x: number,
  z: number,
  players: { id: string; position?: [number, number, number]; downedUntil?: number | null; team?: string }[],
  now = Date.now(),
) {
  let best: (typeof players)[number] | null = null
  let bestD = RESCUE_RANGE
  for (const p of players) {
    if (p.id === selfId || !p.position || !isDowned(p, now) || p.team === 'spectator') continue
    const d = Math.hypot(p.position[0] - x, p.position[2] - z)
    if (d <= bestD) {
      best = p
      bestD = d
    }
  }
  return best
}
