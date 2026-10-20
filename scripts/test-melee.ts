import { ATTACK_RANGE, meleeHits } from '../shared/combat.ts'

function must(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg)
}

must(meleeHits(0, 0, 0, 0, 0.3), '貼身 0.3 應命中')
must(meleeHits(0, 0, 0, 0, 0.9), '貼身 0.9 應命中')
must(meleeHits(0, 0, 0, 0, -0.5), '背後近身 0.5 應命中')
must(meleeHits(0, 0, Math.PI, 0, 0.4), '自己背對、對方在 +Z 近身也應命中')

must(meleeHits(0, 0, 0, 0, 1.6), '正面 1.6 在扇形內應命中')
must(!meleeHits(0, 0, 0, 0, -1.6), '背後 1.6 不該命中')
must(!meleeHits(0, 0, 0, 2.2, 0), '側面 2.2 超出 ±60° 不該命中')
must(!meleeHits(0, 0, 0, 0, 3.2, ATTACK_RANGE), '超出距離不該命中')

const a = { x: 10, z: 10, rot: 0 }
const b = { x: 10.4, z: 10.2, rot: Math.PI }
must(meleeHits(a.x, a.z, a.rot, b.x, b.z), 'A 打貼身的 B 應命中')
must(meleeHits(b.x, b.z, b.rot, a.x, a.z), 'B 打貼身的 A 應命中')

console.log('melee: ok')
