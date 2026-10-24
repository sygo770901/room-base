import { acceptMove, type TagRoom } from '../server/tag.ts'
import {
  DASH_CD_GHOST_MS,
  DASH_CD_MS,
  DASH_DISTANCE,
  DASH_DURATION_MS,
  DASH_IFRAME_MS,
  PLAYER_SPEED,
  SPRINT_CD_MS,
  SPRINT_MAX_MS,
  SPRINT_MUL,
  beginSprint,
  dashCoolingDown,
  dashCooldownMs,
  endSprint,
  isSprintActive,
  sprintSpeedMul,
  tapDashTiming,
} from '../shared/movement.ts'
import type { GameMode } from '../shared/modes.ts'
import type { PlayerState } from '../server/types.ts'

const now = 6_000_000

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

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
    roomId: `sprint-${mode}`,
    mode,
    scene: 'kenney',
    players: { p },
    lastMoveAt: { p: now },
    moveGrant: {},
  }
}

const tap = tapDashTiming(now, 'hider')
assert(tap.until - now === DASH_DURATION_MS, '點一下短衝時長應維持 200ms')
assert(tap.nextAt - now === DASH_CD_MS, '人類短衝冷卻應維持 4 秒')
assert(tap.iframeUntil - now === DASH_IFRAME_MS, '點一下仍有原本的無敵幀')
assert(dashCooldownMs('ghost') === DASH_CD_GHOST_MS, '鬼的短衝冷卻應維持 6 秒')
assert(tapDashTiming(now, 'ghost').nextAt - now === DASH_CD_GHOST_MS, '鬼的短衝冷卻函式應維持 6 秒')
assert(DASH_DISTANCE === 4, '短衝距離應維持 4 格')

const started = beginSprint(0, {}, now)
assert(started.ok && started.fresh && started.holdStart === now, '冷卻結束後應能開始按住衝刺')
assert(!('iframeUntil' in started), '按住衝刺不該給無敵幀')

const hold = { sprintHoldStart: now }
assert(sprintSpeedMul(hold, now) === SPRINT_MUL, '按住當下就是 1.3 倍')
assert(sprintSpeedMul(hold, now + SPRINT_MAX_MS - 1) === SPRINT_MUL, '滿 5 秒前仍是 1.3 倍')
assert(isSprintActive(hold, now + 2500), '按住中段應算衝刺中')
assert(sprintSpeedMul(hold, now + SPRINT_MAX_MS) === 1, '滿 5 秒當下速度回到 1 倍')
assert(sprintSpeedMul(hold, now + 6000) === 1, '第 6 秒速度應回到正常')
assert(!isSprintActive(hold, now + 6000), '第 6 秒不該還在衝刺')

const early = endSprint(hold, now + 2000)
assert(early != null && early.holdEnd === now + 2000, '提早放開應立刻結束')
assert(early != null && early.nextAt === now + 2000 + SPRINT_CD_MS, '冷卻應從放開起算 5 秒')
assert(sprintSpeedMul({ ...hold, sprintHoldEnd: early?.holdEnd }, now + 2000) === 1, '放開後速度立刻回到 1 倍')

const late = endSprint(hold, now + 7000)
assert(late != null && late.holdEnd === now + SPRINT_MAX_MS, '按超過 5 秒應在第 5 秒收掉')
assert(late != null && late.nextAt === now + SPRINT_MAX_MS + SPRINT_CD_MS, '滿 5 秒的冷卻從收掉起算，不從晚放開起算')

assert(dashCoolingDown(early?.nextAt ?? 0, now + 2000 + 1000), '冷卻中不能再衝')
const blockedTap = dashCoolingDown(early?.nextAt ?? 0, now + 2000 + 1000)
assert(blockedTap, '冷卻中點一下短衝也要被擋')
const blockedHold = beginSprint(early?.nextAt ?? 0, { sprintHoldStart: now, sprintHoldEnd: early?.holdEnd }, now + 3000)
assert(!blockedHold.ok && blockedHold.reason === 'cd', '冷卻中按住衝刺要被擋')
const after = beginSprint(early?.nextAt ?? 0, { sprintHoldStart: now, sprintHoldEnd: early?.holdEnd }, early?.nextAt ?? 0)
assert(after.ok && after.fresh, '冷卻結束後可以再衝')

for (const mode of ['boss', 'tag'] as const) {
  const dashP = player()
  const dashRoom = room(mode, dashP)
  dashRoom.moveGrant = { p: { dashUntil: now + DASH_DURATION_MS } }
  const dashOk = acceptMove(
    dashRoom,
    dashP,
    { position: [78, 0, 34 + DASH_DISTANCE], rotationY: 0 },
    now + DASH_DURATION_MS,
  )
  assert(dashOk, `${mode} 點一下短衝 ${DASH_DISTANCE} 格仍應通過`)
  assert(Math.abs((dashP.position[2] ?? 0) - (34 + DASH_DISTANCE)) < 1e-6, `${mode} 短衝後座標應落在請求點`)

  const sprintP = player()
  const sprintRoom = room(mode, sprintP)
  sprintRoom.moveGrant = { p: { sprintHoldStart: now } }
  const stepDt = 100
  const step = PLAYER_SPEED * SPRINT_MUL * (stepDt / 1000)
  let z = 34
  let at = now
  for (let i = 0; i < 8; i++) {
    at += stepDt
    z += step
    const ok = acceptMove(sprintRoom, sprintP, { position: [78, 0, z], rotationY: 0 }, at)
    assert(ok, `${mode} 衝刺中第 ${i + 1} 步 1.3 倍速應通過`)
    assert(Math.abs((sprintP.position[2] ?? 0) - z) < 1e-4, `${mode} 1.3 倍速不該被拉回，z=${sprintP.position[2]} 期望 ${z}`)
  }

  const later = player()
  const laterRoom = room(mode, later)
  laterRoom.lastMoveAt = { p: now + SPRINT_MAX_MS }
  laterRoom.moveGrant = { p: { sprintHoldStart: now } }
  const far = PLAYER_SPEED * SPRINT_MUL * 1
  const at6 = acceptMove(laterRoom, later, { position: [78, 0, 34 + far], rotationY: 0 }, now + 6000)
  const moved = (later.position[2] ?? 34) - 34
  assert(sprintSpeedMul(laterRoom.moveGrant?.p, now + 6000) === 1, `${mode} 第 6 秒倍率應為 1`)
  assert(moved < far - 0.4, `${mode} 第 6 秒不該再吃到 1.3 倍的整段距離（走了 ${moved.toFixed(3)} / ${far.toFixed(3)} ok=${at6}）`)
}

console.log('sprint-hold: ok', { mul: SPRINT_MUL, maxMs: SPRINT_MAX_MS, cdMs: SPRINT_CD_MS })
