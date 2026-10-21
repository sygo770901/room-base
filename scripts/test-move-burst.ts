import { acceptMove, type TagRoom } from '../server/tag.ts'
import { DASH_DISTANCE, MOVE_SLACK, PLAYER_SPEED } from '../shared/movement.ts'
import type { GameMode } from '../shared/modes.ts'
import type { PlayerState } from '../server/types.ts'

const now = 8_000_000

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
    roomId: `burst-${mode}`,
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

/** 客戶端約每 200ms 送一次時，1 秒網路停頓後一次灌進 5 筆。 */
const step = PLAYER_SPEED * 0.2

for (const mode of ['boss', 'tag'] as const) {
  const p = player()
  const r = room(mode, p)
  const t = now + 1000
  let z = 34
  for (let i = 0; i < 5; i++) {
    z += step
    const ok = acceptMove(r, p, { position: [78, 0, z], rotationY: 0 }, t)
    assert(ok, `${mode} 停頓 1 秒後第 ${i + 1} 筆正常移動不該被拉回`)
  }
  assert(Math.abs((p.position[2] ?? 0) - (34 + step * 5)) < 1e-6, `${mode} 五筆走完應累積 ${step * 5}`)

  const cheat = player()
  const cheatRoom = room(mode, cheat)
  const tele = acceptMove(cheatRoom, cheat, { position: [78, 0, 34 + 20], rotationY: 0 }, now + 60_000)
  assert(!tele, `${mode} 站很久後單次 20 格仍應拒絕`)
  assert(cheat.position[2] === 34, `${mode} 瞬移被拒後應留在原位`)
  assert(cheatRoom.lastMoveAt?.p === now, `${mode} 被拒的瞬移不該更新 lastMoveAt`)

  const dashP = player()
  const dashRoom = room(mode, dashP)
  const dashAt = now + 1000
  dashRoom.moveGrant = { p: { dashUntil: dashAt + 500 } }
  let accepted = 0
  let dz = 34
  for (let i = 0; i < 5; i++) {
    dz += DASH_DISTANCE
    if (acceptMove(dashRoom, dashP, { position: [78, 0, dz], rotationY: 0 }, dashAt)) accepted += 1
  }
  const shared = PLAYER_SPEED * 0.8 * MOVE_SLACK + 0.3 + DASH_DISTANCE * MOVE_SLACK
  assert(accepted >= 1, `${mode} 有衝刺授權時至少第一筆 4 格要過`)
  assert(accepted < 5, `${mode} 一次衝刺預算不能讓五筆各 4 格都通過（過了 ${accepted}）`)
  assert(DASH_DISTANCE * accepted <= shared + 1e-6, `${mode} 通過距離 ${DASH_DISTANCE * accepted} 不該超過共用預算 ${shared}`)
}

console.log('move-burst: ok', { step: Number(step.toFixed(3)), modes: 'boss,tag' })
