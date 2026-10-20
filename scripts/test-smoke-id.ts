import { anonSmokeId } from '../shared/smoke.ts'

const playerId = 'abcXYZ1234567890'
const ids = Array.from({ length: 40 }, () => anonSmokeId())
for (const id of ids) {
  if (id.includes(playerId) || id.includes(playerId.slice(0, 6))) {
    throw new Error(`煙霧編號洩漏身分：${id}`)
  }
  if (!id.startsWith('smoke-')) throw new Error(`格式不對：${id}`)
}
if (new Set(ids).size !== ids.length) throw new Error('煙霧編號撞號')
console.log('smoke-id: ok', ids[0])
