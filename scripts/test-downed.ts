import { deathAnimTrigger } from '../shared/anim.ts'
import { isDowned, nearestDowned, RESCUE_RANGE } from '../shared/downed.ts'

const now = 1_000_000
if (isDowned({ downedUntil: now + 1000 }, now) !== true) throw new Error('倒地中應為 true')
if (isDowned({ downedUntil: now - 1 }, now) !== false) throw new Error('逾時不該倒地')
const near = nearestDowned(
  'me',
  0,
  0,
  [
    { id: 'me', position: [0, 0, 0], downedUntil: now + 1000 },
    { id: 'a', position: [1, 0, 0], downedUntil: now + 1000 },
    { id: 'b', position: [8, 0, 0], downedUntil: now + 1000 },
  ],
  now,
)
if (near?.id !== 'a') throw new Error('應找到 1.5 格內的隊友')
if (RESCUE_RANGE !== 1.5) throw new Error('救援距離被改了')
if (deathAnimTrigger(false, true) !== 'play') throw new Error('活著→倒地應只播一次')
if (deathAnimTrigger(true, true) !== 'hold') throw new Error('持續倒地不該重播')
if (deathAnimTrigger(true, false) !== 'idle') throw new Error('扶起應回 Idle')
if (deathAnimTrigger(false, false) !== 'live') throw new Error('活著維持一般動作')
console.log('downed: ok')
