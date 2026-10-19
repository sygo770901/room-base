/** 打鴨王倒地救援（先定，昱豪可改）。 */
export const DOWNED_MS = 15_000
export const RESCUE_RANGE = 1.5
export const RESCUE_HOLD_MS = 2000
export const RESCUE_HP = 40

export function isDowned(player: { downedUntil?: number | null }, now = Date.now()) {
  return Boolean(player.downedUntil && now < player.downedUntil)
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
