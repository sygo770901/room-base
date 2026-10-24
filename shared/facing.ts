/** 進戰後自動面向目前目標。5 秒沒攻擊就脫戰。鬼抓人不上鎖。 */
export const COMBAT_LOCK_MS = 5000
export const COMBAT_ACQUIRE_RANGE = 8

export type CombatLock = {
  targetId: string
  until: number
}

export type FacingBody = {
  id: string
  x: number
  z: number
  alive?: boolean
}

export function attackCombat(
  mode: string | null | undefined,
  lock: CombatLock | undefined,
  now: number,
  self: { x: number; z: number },
  bodies: FacingBody[],
  hitId: string | null,
): CombatLock | null {
  if (mode === 'tag') return null
  const alive = bodies.filter((b) => b.alive !== false)
  let targetId: string | null = hitId && alive.some((b) => b.id === hitId) ? hitId : null
  if (!targetId && lock && now < lock.until && alive.some((b) => b.id === lock.targetId)) {
    targetId = lock.targetId
  }
  if (!targetId) {
    let best: FacingBody | null = null
    let bestD = COMBAT_ACQUIRE_RANGE
    for (const b of alive) {
      const d = Math.hypot(b.x - self.x, b.z - self.z)
      if (d <= bestD) {
        best = b
        bestD = d
      }
    }
    targetId = best?.id ?? null
  }
  if (!targetId) return null
  return { targetId, until: now + COMBAT_LOCK_MS }
}

export function activeLock(lock: CombatLock | undefined, now: number) {
  if (!lock || now >= lock.until) return null
  return lock
}

export function yawToward(px: number, pz: number, tx: number, tz: number) {
  return Math.atan2(tx - px, tz - pz)
}

/** 鬼抓人永遠用原本朝向。脫戰或目標不在了也回到原本朝向。 */
export function combatYaw(
  mode: string | null | undefined,
  lock: CombatLock | undefined,
  now: number,
  self: { x: number; z: number; rotationY: number },
  bodies: FacingBody[],
) {
  if (mode === 'tag') return self.rotationY
  const live = activeLock(lock, now)
  if (!live) return self.rotationY
  const target = bodies.find((b) => b.id === live.targetId && b.alive !== false)
  if (!target) return self.rotationY
  return yawToward(self.x, self.z, target.x, target.z)
}

export function combatFacingPayload(id: string, rotationY: number, lock: CombatLock) {
  return { id, rotationY, until: lock.until, targetId: lock.targetId }
}
