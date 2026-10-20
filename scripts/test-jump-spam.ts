import { acceptMove, type TagRoom } from '../server/tag.ts'
import { canStartJump } from '../shared/platforms.ts'
import { platformsOf } from '../shared/mapData.ts'
import type { PlayerState } from '../server/types.ts'

function playerAt(y: number): PlayerState {
  return {
    id: 'p1',
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position: [78, y, 34],
    rotationY: 0,
    seated: null,
    role: 'guest',
    hp: 100,
    team: 'hider',
  }
}

function roomOf(player: PlayerState): TagRoom {
  return {
    roomId: 'jump-test',
    scene: 'kenney',
    players: { p1: player },
    lastMoveAt: { p1: Date.now() - 50 },
    moveGrant: {},
  }
}

const air = playerAt(2.5)
const airRoom = roomOf(air)
const now = Date.now()
let granted = 0
for (let i = 0; i < 20; i++) {
  if (canStartJump(78, 34, air.position[1] ?? 0, platformsOf('kenney'))) granted++
}
if (granted !== 0) throw new Error(`空中不該起跳，卻通過 ${granted} 次`)

const ok = acceptMove(airRoom, air, { position: [78, 2.5, 34], rotationY: 0 }, now)
if (!ok) throw new Error('高度 2.5 應被收下後拉回，不該整包拒絕')
if ((air.position[1] ?? 0) > 0.2) throw new Error(`應拉回地面，實際 y=${air.position[1]}`)

const ground = playerAt(0)
if (!canStartJump(78, 34, 0, platformsOf('kenney'))) throw new Error('地面應可跳')
if (!canStartJump(66, 26, 2.12, platformsOf('kaykit'))) throw new Error('KayKit 箱子頂應可跳')

console.log('jump-spam: ok，20 次空中跳被拒，y=2.5 拉回', air.position[1])
