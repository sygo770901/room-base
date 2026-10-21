import type { Server } from 'socket.io'
import { respawnPlayer, type CombatRoom } from '../server/combat.ts'
import { resumeJoinedPlayer } from '../server/socket.ts'
import { acceptMove, recordMoveOrigin, type TagRoom } from '../server/tag.ts'
import { SPAWN_POINTS } from '../shared/dungeon.ts'
import { PLAYER_SPEED } from '../shared/movement.ts'
import type { PlayerState } from '../server/types.ts'

const now = 9_000_000
const step = PLAYER_SPEED * 0.2

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function player(id = 'p', position: [number, number, number] = [12, 0, 8]): PlayerState {
  return {
    id,
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position,
    rotationY: 0,
    seated: null,
    role: 'host',
    hp: 100,
    team: 'hider',
    hidden: false,
  }
}

function room(p: PlayerState): TagRoom {
  return {
    roomId: 'spawn-step',
    mode: 'boss',
    scene: 'kenney',
    players: { [p.id]: p },
    lastMoveAt: {},
    moveGrant: {},
    moveBank: {},
  }
}

const io = {
  to: () => ({
    emit() {},
  }),
} as unknown as Server

function stepFrom(r: TagRoom, p: PlayerState, at: number) {
  const x = p.position[0]
  const z = p.position[2] + step
  return acceptMove(r, p, { position: [x, 0, z], rotationY: p.rotationY }, at)
}

function teleportFrom(r: TagRoom, p: PlayerState, at: number) {
  return acceptMove(r, p, { position: [p.position[0], 0, p.position[2] + 20], rotationY: p.rotationY }, at)
}

// 新進房：出生點先記下來，同一個時間戳的正常步伐要過，20 格仍拒絕。
{
  const spawn = SPAWN_POINTS[0]
  const p = player('p', [spawn.x, 0, spawn.z])
  const r = room(p)
  r.moveBank = { p: { accruedAt: now, walk: 0, dash: 0, pad: true } }
  r.lastMoveAt = { p: now - 60_000 }
  recordMoveOrigin(r, p.id, now)
  assert(stepFrom(r, p, now), '新進房後第一筆正常步伐不該被拉回')
  assert(Math.abs(p.position[2] - (spawn.z + step)) < 1e-6, '新進房的步伐應從出生點往前')

  const stuck = player('q', [spawn.x, 0, spawn.z])
  const stuckRoom = room(stuck)
  recordMoveOrigin(stuckRoom, stuck.id, now)
  const before = stuck.position[2]
  assert(!teleportFrom(stuckRoom, stuck, now), '新進房當下單次 20 格仍應拒絕')
  assert(stuck.position[2] === before, '被拒的瞬移不該改座標')
  assert(stuckRoom.lastMoveAt?.q === now, '被拒的瞬移不該改寫起點時間')
}

// 復活：舊預算用完也要先記新的出生點，第一筆才過得了。
{
  const p = player('p', [1, 0, 1])
  const r = room(p)
  r.moveBank = { p: { accruedAt: now, walk: 0, dash: 0, pad: true } }
  r.lastMoveAt = { p: now }
  r.moveGrant = { p: { dashUntil: now + 5000 } }
  const combat = r as unknown as CombatRoom
  combat.hurtUntil = {}
  respawnPlayer(combat, io, p, now)
  const originZ = p.position[2]
  assert(p.position[0] !== 1 || p.position[2] !== 1, '復活應改到出生點')
  assert(!r.moveGrant?.p, '復活不該留下舊的衝刺授權')
  assert(stepFrom(r, p, now), '復活後第一筆正常步伐不該被拉回')
  assert(Math.abs(p.position[2] - (originZ + step)) < 1e-6, '復活後的步伐應從新出生點往前')

  const cheat = player('c', [1, 0, 1])
  const cheatRoom = room(cheat)
  cheatRoom.moveBank = { c: { accruedAt: now, walk: 0, dash: 0, pad: true } }
  const cheatCombat = cheatRoom as unknown as CombatRoom
  cheatCombat.hurtUntil = {}
  respawnPlayer(cheatCombat, io, cheat, now)
  const stay: [number, number, number] = [cheat.position[0], cheat.position[1], cheat.position[2]]
  assert(!teleportFrom(cheatRoom, cheat, now), '復活當下單次 20 格仍應拒絕')
  assert(cheat.position[0] === stay[0] && cheat.position[2] === stay[2], '復活後被拒的瞬移應留在出生點')
}

// 重連：先套回儲存座標，再記起點。從舊座標跨出的一小步要被拒，從新座標的正常步伐要過。
{
  const p = player('p', [12, 0, 8])
  const r = room(p)
  r.moveBank = { p: { accruedAt: now, walk: 0, dash: 0, pad: true } }
  r.lastMoveAt = { p: now }
  resumeJoinedPlayer(r, p, { position: [40, 3, 60], rotationY: 1.2 }, now)
  assert(p.position[0] === 40 && p.position[1] === 0 && p.position[2] === 60, '重連應站回儲存的地面座標')
  assert(p.rotationY === 1.2, '重連應套回面向')
  const oldStep = acceptMove(r, p, { position: [12, 0, 8 + step], rotationY: 1.2 }, now)
  assert(!oldStep, '重連後不該還能從斷線前的座標走出一小步')
  assert(p.position[2] === 60, '從舊座標走出的步伐被拒後應留在重連點')
  assert(stepFrom(r, p, now), '重連後從新座標走出的第一筆正常步伐不該被拉回')

  const hidden = player('h', [12, 0, 8])
  hidden.hidden = true
  const hiddenRoom = room(hidden)
  hiddenRoom.moveBank = { h: { accruedAt: now, walk: 0, dash: 0, pad: true } }
  resumeJoinedPlayer(hiddenRoom, hidden, { position: [40, 0, 60], rotationY: 0.4 }, now)
  assert(hidden.position[0] === 12 && hidden.position[2] === 8, '躲藏中重連不該被拉出箱子')
  assert(stepFrom(hiddenRoom, hidden, now), '躲藏中重連後第一筆正常步伐仍不該被拉回')

  const far = player('f', [15, 0, 15])
  const farRoom = room(far)
  resumeJoinedPlayer(farRoom, far, { position: [48, 1, 70], rotationY: 0 }, now)
  assert(!teleportFrom(farRoom, far, now), '重連當下單次 20 格仍應拒絕')
  assert(far.position[0] === 48 && far.position[2] === 70, '重連後被拒的瞬移應留在儲存座標')
}

console.log('spawn-step: ok', { step: Number(step.toFixed(3)) })
