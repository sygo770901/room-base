/** 事件播報（先定，昱豪可改）。 */
export const FEED_TTL_MS = 3000
export const FEED_MAX = 4

export type FeedItem = {
  id: string
  text: string
  at: number
}

export function pushFeedItem(list: FeedItem[] | undefined, text: string, now = Date.now()): FeedItem[] {
  const live = (list ?? []).filter((i) => now - i.at < FEED_TTL_MS)
  live.push({ id: `ev-${now.toString(36)}-${live.length}`, text, at: now })
  return live.slice(-FEED_MAX)
}

export function liveFeed(list: FeedItem[] | undefined, now = Date.now()) {
  return (list ?? []).filter((i) => now - i.at < FEED_TTL_MS).slice(-FEED_MAX)
}
