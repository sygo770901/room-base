import { resolveJoinPlayerId } from '../shared/identity.ts'

const victim = 'victim-id-aaaa'
const secret = 'secret-aaaa-bbbb'
const other = 'other-secret-cccc'

const ok = resolveJoinPlayerId({
  claimedId: victim,
  secret,
  storedSecret: secret,
  existing: true,
  fallbackId: 'new-player-1111',
})
if (ok.playerId !== victim || ok.impersonation) throw new Error('本人重連應回到原角色')

const fake = resolveJoinPlayerId({
  claimedId: victim,
  secret: other,
  storedSecret: secret,
  existing: true,
  fallbackId: 'new-player-1111',
})
if (fake.playerId === victim || !fake.impersonation) throw new Error('冒充者不該接管原角色')

const first = resolveJoinPlayerId({
  claimedId: victim,
  secret,
  existing: false,
  fallbackId: 'new-player-1111',
})
if (first.playerId !== victim || first.impersonation) throw new Error('首次加入應使用自己的 id')

const migrate = resolveJoinPlayerId({
  claimedId: victim,
  secret,
  existing: true,
  fallbackId: 'new-player-1111',
})
if (migrate.playerId !== victim || migrate.impersonation) throw new Error('舊房無密鑰時應允許本人綁定')

console.log('impersonate: ok')
