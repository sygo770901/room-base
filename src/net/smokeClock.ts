import { POOP_FLIGHT_MS, type SmokeCloud } from '../../shared/smoke'

/** 這次連線裡已經改記到客戶端時鐘的雲。 */
const rebased = new Map<string, { thrownAt: number; landAt: number }>()
/** 進房當下就在場上的雲，沿用伺服器時間，避免重播已經落地的便便。 */
const skip = new Set<string>()

export function resetSmokeClock(existing: SmokeCloud[] = []) {
  rebased.clear()
  skip.clear()
  for (const cloud of existing) {
    if (cloud.thrownAt != null || cloud.landAt != null) skip.add(cloud.id)
  }
}

function prune(live: SmokeCloud[]) {
  const ids = new Set(live.map((c) => c.id))
  for (const id of rebased.keys()) if (!ids.has(id)) rebased.delete(id)
  for (const id of skip) if (!ids.has(id)) skip.delete(id)
}

/** 第一次在 smoke:sync 看到這團雲時，把 thrownAt/landAt 改記到客戶端時鐘，飛行長度維持 560ms。 */
export function rebaseSmokeFlight(incoming: SmokeCloud[], now = Date.now()): SmokeCloud[] {
  prune(incoming)
  return incoming.map((cloud) => {
    const kept = rebased.get(cloud.id)
    if (kept) return { ...cloud, thrownAt: kept.thrownAt, landAt: kept.landAt }
    if (skip.has(cloud.id)) return cloud
    const duration =
      cloud.thrownAt != null && cloud.landAt != null ? cloud.landAt - cloud.thrownAt : POOP_FLIGHT_MS
    const span = duration > 0 ? duration : POOP_FLIGHT_MS
    const thrownAt = now
    const landAt = now + span
    rebased.set(cloud.id, { thrownAt, landAt })
    return { ...cloud, thrownAt, landAt }
  })
}

/** room:state 會帶伺服器時鐘。已經改記過的雲維持客戶端的 thrownAt/landAt。 */
export function keepRebasedSmokeFlight(incoming: SmokeCloud[]): SmokeCloud[] {
  return incoming.map((cloud) => {
    const kept = rebased.get(cloud.id)
    if (!kept) return cloud
    return { ...cloud, thrownAt: kept.thrownAt, landAt: kept.landAt }
  })
}

/** 截圖時把指定的雲留在客戶端，避免伺服器 8 秒後清掉，飛行時間仍用凍結的時鐘。 */
export function retainHeldSmokes(previous: SmokeCloud[], incoming: SmokeCloud[]): SmokeCloud[] {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return incoming
  const ids = (window as Window & { __holdSmoke?: string[] }).__holdSmoke
  if (!ids?.length) return incoming
  const hold = new Set(ids)
  const seen = new Set(incoming.map((cloud) => cloud.id))
  const extra = previous.filter((cloud) => hold.has(cloud.id) && !seen.has(cloud.id))
  return extra.length ? incoming.concat(extra) : incoming
}
