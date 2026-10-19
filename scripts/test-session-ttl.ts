import { SESSION_TTL_MS, isSessionFresh } from '../src/net/session.ts'

const now = 1_700_000_000_000
if (!isSessionFresh(now - 10_000, now)) throw new Error('10 秒內應仍有效')
if (isSessionFresh(now - SESSION_TTL_MS - 1, now)) throw new Error('超過 1 小時應失效')
if (isSessionFresh(undefined, now)) throw new Error('沒有時間戳不該自動回房')
if (!isSessionFresh(now - SESSION_TTL_MS, now)) throw new Error('剛好滿 1 小時應仍有效')
console.log('session-ttl: ok', SESSION_TTL_MS)
