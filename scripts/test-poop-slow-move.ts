import { acceptMove, type TagRoom } from '../server/tag.ts'
import { PLAYER_SPEED, moveAllowance } from '../shared/movement.ts'
import { POOP_SLOW_MUL } from '../shared/smoke.ts'

const now = 1_000_000
const z0 = 40
const room: TagRoom = {
  roomId: 'slow',
  players: {
    a: {
      id: 'a',
      name: '測',
      color: '#fff',
      classId: 'ranger',
      position: [78, 0, z0],
      rotationY: 0,
      seated: null,
      role: 'host',
      hp: 100,
    },
  },
  lastMoveAt: { a: now },
  moveGrant: {},
  poopSlowUntil: { a: now + 1000 },
  scene: 'kenney',
}

const first = acceptMove(room, room.players.a, { position: [78, 0, z0], rotationY: 0 }, now)
if (!first) throw new Error('第一次座標應接受')

const dt = 100
const full = PLAYER_SPEED * (dt / 1000)
const over = acceptMove(room, room.players.a, { position: [78, 0, z0 + full], rotationY: 0 }, now + dt)
if (over) throw new Error('減速中不該接受全速移動')
if (room.players.a.position[2] !== z0) throw new Error('超過 0.75 倍速要把人拉回原位')

const allow = moveAllowance(dt, undefined, now + dt, { poopSlow: true })
const okStep = Math.min(allow.horiz * 0.8, PLAYER_SPEED * POOP_SLOW_MUL * (dt / 1000))
const ok = acceptMove(room, room.players.a, { position: [78, 0, z0 + okStep], rotationY: 0 }, now + dt * 2)
if (!ok) throw new Error('減速後的合法步距應通過')
if (Math.abs(POOP_SLOW_MUL - 0.75) > 1e-9) throw new Error('減速倍率應為 0.75')

console.log('poop-slow-move: ok')
