import { acceptMove, type TagRoom } from '../server/tag.ts'
import { DASH_DISTANCE, DASH_DURATION_MS, JUMP_MAX_DELTA, MOVE_DT_CAP_SEC, moveAllowance } from '../shared/movement.ts'
import type { GameMode } from '../shared/modes.ts'
import type { PlayerState } from '../server/types.ts'

const now = 5_000_000

function player(): PlayerState {
  return {
    id: 'p',
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position: [78, 0, 34],
    rotationY: 0,
    seated: null,
    role: 'host',
    hp: 100,
    team: 'hider',
  }
}

function room(mode: GameMode, p: PlayerState): TagRoom {
  return {
    roomId: `move-${mode}`,
    mode,
    scene: 'kenney',
    players: { p },
    lastMoveAt: { p: now },
    moveGrant: {},
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const capMs = MOVE_DT_CAP_SEC * 1000
const capped = moveAllowance(60_000, undefined, now).horiz
const atCap = moveAllowance(capMs, undefined, now).horiz
assert(Math.abs(capped - atCap) < 1e-9, `站 60 秒的允許距離 ${capped} 不該大於 ${MOVE_DT_CAP_SEC}s 上限 ${atCap}`)
assert(capped < 20, `單步上限 ${capped} 不該放到 20`)

for (const mode of ['boss', 'tag'] as const) {
  const idle = player()
  const idleRoom = room(mode, idle)
  const tele = acceptMove(idleRoom, idle, { position: [78, 0, 34 + 20], rotationY: 0 }, now + 60_000)
  assert(!tele, `${mode} 站 60 秒後不該接受 20 單位瞬移`)
  assert(idle.position[2] === 34, `${mode} 拒絕後應留在原位，實際 z=${idle.position[2]}`)
  assert(idleRoom.lastMoveAt?.p === now, `${mode} 被拒的移動不該更新 lastMoveAt`)

  const step = Math.max(0, capped - 0.05)
  const okIdle = acceptMove(idleRoom, idle, { position: [78, 0, 34 + step], rotationY: 0 }, now + 60_000)
  assert(okIdle, `${mode} 站很久仍應允許上限內的一步（${step.toFixed(2)}）`)

  const dashP = player()
  const dashRoom = room(mode, dashP)
  dashRoom.moveGrant = { p: { dashUntil: now + DASH_DURATION_MS } }
  const dashOk = acceptMove(
    dashRoom,
    dashP,
    { position: [78, 0, 34 + DASH_DISTANCE], rotationY: 0 },
    now + DASH_DURATION_MS,
  )
  assert(dashOk, `${mode} 衝刺 ${DASH_DISTANCE} 格 / ${DASH_DURATION_MS}ms 應通過`)
  assert(Math.abs((dashP.position[2] ?? 0) - (34 + DASH_DISTANCE)) < 1e-6, `${mode} 衝刺後座標不對`)

  const noDash = player()
  const noDashRoom = room(mode, noDash)
  const dashCheat = acceptMove(
    noDashRoom,
    noDash,
    { position: [78, 0, 34 + DASH_DISTANCE], rotationY: 0 },
    now + DASH_DURATION_MS,
  )
  assert(!dashCheat, `${mode} 沒有衝刺許可不該一次走 ${DASH_DISTANCE} 格`)
  assert(noDash.position[2] === 34, `${mode} 假衝刺應留在原位`)

  const jumpP = player()
  const jumpRoom = room(mode, jumpP)
  jumpRoom.moveGrant = { p: { jumpUntil: now + 400 } }
  const jumpY = Math.min(2.1, JUMP_MAX_DELTA)
  const jumpOk = acceptMove(jumpRoom, jumpP, { position: [78, jumpY, 34], rotationY: 0 }, now + 120)
  assert(jumpOk, `${mode} 有跳躍許可應接受高度 ${jumpY}`)
  assert((jumpP.position[1] ?? 0) > 1.5, `${mode} 跳躍應離開地面，實際 y=${jumpP.position[1]}`)

  const groundP = player()
  const groundRoom = room(mode, groundP)
  const airCheat = acceptMove(groundRoom, groundP, { position: [78, jumpY, 34], rotationY: 0 }, now + 120)
  assert(airCheat, `${mode} 沒許可的高度應被拉回地面而不是整包拒絕`)
  assert((groundP.position[1] ?? 0) <= 0.2, `${mode} 沒跳卻升空 y=${groundP.position[1]}`)
}

console.log('boss-teleport: ok', { capped: Number(capped.toFixed(3)), modes: 'boss,tag' })
