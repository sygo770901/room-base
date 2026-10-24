import {
  COMBAT_LOCK_MS,
  activeLock,
  attackCombat,
  combatFacingPayload,
  combatYaw,
  yawToward,
  type FacingBody,
} from '../shared/facing.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const self = { x: 10, z: 10, rotationY: 0 }
const mob: FacingBody = { id: 'knight', x: 10, z: 14, alive: true }
const other: FacingBody = { id: 'mage', x: 18, z: 10, alive: true }
const bodies = [mob, other]

const entered = attackCombat('boss', undefined, 1_000, self, bodies, mob.id)
assert(entered != null && entered.targetId === 'knight', '打中的怪應成為目前目標')
assert(entered != null && entered.until === 1_000 + COMBAT_LOCK_MS, '進戰應鎖 5 秒')
assert(activeLock(entered ?? undefined, 1_000 + COMBAT_LOCK_MS - 1) != null, '4.999 秒仍在戰鬥')
assert(activeLock(entered ?? undefined, 1_000 + COMBAT_LOCK_MS) == null, '滿 5 秒沒攻擊應脫戰')

const refreshed = attackCombat('hunt', entered ?? undefined, 3_000, self, bodies, null)
assert(refreshed != null && refreshed.targetId === 'knight', '揮空應維持目前目標')
assert(refreshed != null && refreshed.until === 3_000 + COMBAT_LOCK_MS, '再次攻擊應把脫戰時間往後推 5 秒')
assert(activeLock(refreshed ?? undefined, 7_999) != null, '刷新後 5 秒前仍在戰鬥')
assert(activeLock(refreshed ?? undefined, 8_000) == null, '刷新後滿 5 秒應脫戰')

const faced = combatYaw('boss', entered ?? undefined, 1_500, self, bodies)
const expectYaw = yawToward(self.x, self.z, mob.x, mob.z)
assert(Math.abs(faced - expectYaw) < 1e-9, `應面向目標，得到 ${faced} 期望 ${expectYaw}`)
assert(combatYaw('boss', entered ?? undefined, 1_000 + COMBAT_LOCK_MS, self, bodies) === self.rotationY, '脫戰後回到自己的朝向')

const payload = combatFacingPayload('p', faced, entered!)
const seenByA = payload.rotationY
const seenByB = payload.rotationY
assert(seenByA === seenByB && seenByA === expectYaw, '所有客戶端應看到同一個伺服器朝向')
const again = combatFacingPayload('p', combatYaw('boss', entered ?? undefined, 1_500, self, bodies), entered!)
assert(again.rotationY === payload.rotationY && again.targetId === payload.targetId, '同一狀態再算一次朝向必須相同')

const tagLock = attackCombat('tag', undefined, 1_000, self, [{ id: 'hider', x: 10, z: 12, alive: true }], 'hider')
assert(tagLock == null, '鬼抓人不該進戰鬥鎖')
const tagYaw = combatYaw('tag', entered ?? undefined, 1_500, { ...self, rotationY: 0.4 }, bodies)
assert(tagYaw === 0.4, '鬼抓人即使帶著鎖也要維持原本朝向')

const none = attackCombat('boss', undefined, 1_000, self, [{ id: 'far', x: 100, z: 100, alive: true }], null)
assert(none == null, '附近沒目標不該進戰')

console.log('combat-facing: ok', { lockMs: COMBAT_LOCK_MS })
