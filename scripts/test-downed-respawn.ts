import type { Server } from 'socket.io'
import { requestSpawnRespawn, tickDowned, type CombatRoom } from '../server/combat.ts'
import { acceptMove, type TagRoom } from '../server/tag.ts'
import { PLAYER_MAX_HP } from '../shared/combat.ts'
import { DOWNED_MS, DOWNED_SOLO_MS, RESPAWN_UNLOCK_MS, respawnChoiceReady } from '../shared/downed.ts'
import { spawnOf } from '../shared/heightmaps.ts'
import { spawnPointsOf } from '../shared/mapData.ts'
import { PLAYER_SPEED } from '../shared/movement.ts'
import type { PlayerState } from '../server/types.ts'

const t0 = 5_000_000

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function player(id: string, position: [number, number, number]): PlayerState {
  return {
    id,
    name: id,
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

function room(p: PlayerState): CombatRoom {
  return {
    roomId: `downed-${p.id}`,
    mode: 'boss',
    scene: 'kenney',
    started: true,
    players: { [p.id]: p },
    monsters: [],
    hurtUntil: {},
    nextAttack: {},
    lastMoveAt: {},
    moveGrant: {},
    moveBank: {},
  }
}

const io = { to: () => ({ emit() {} }) } as unknown as Server

function atSpawn(position: [number, number, number]) {
  return spawnPointsOf('kenney').some((_, i) => {
    const sp = spawnOf('kenney', i)
    return Math.hypot(position[0] - sp.x, position[2] - sp.z) < 0.05
  })
}

assert(DOWNED_MS === 15_000, '倒地視窗應維持 15 秒')
assert(DOWNED_SOLO_MS === 3_000, '單人倒地應維持 3 秒')
assert(RESPAWN_UNLOCK_MS === 5_000, '重生按鈕應在倒地 5 秒後出現')
assert(!respawnChoiceReady({ downedAt: t0, downedUntil: t0 + DOWNED_MS }, t0 + RESPAWN_UNLOCK_MS - 1), '5 秒前不能重生')
assert(respawnChoiceReady({ downedAt: t0, downedUntil: t0 + DOWNED_MS }, t0 + RESPAWN_UNLOCK_MS), '滿 5 秒可以重生')
assert(!respawnChoiceReady({ downedAt: t0, downedUntil: t0 + DOWNED_MS }, t0 + DOWNED_MS), '滿 15 秒不再走自願重生')

const home = spawnOf('kenney', 0)
const p = player('p', [home.x, home.y, home.z])
const r = room(p)
r.moveBank = { p: { accruedAt: t0, walk: 100, dash: 100, pad: true } }
r.lastMoveAt = { p: t0 }
const corpse: [number, number, number] = [home.x + 3, home.y, home.z]
assert(
  acceptMove(r as unknown as TagRoom, p, { position: corpse, rotationY: 0 }, t0),
  '倒地點應在出生點 3 公尺內且走得到，否則驗不到拉回',
)
const fallen: [number, number, number] = [p.position[0], p.position[1], p.position[2]]
assert(Math.hypot(fallen[0] - corpse[0], fallen[2] - corpse[2]) < 0.05, '控制組應真的走到倒地點')

p.hp = 0
p.downedAt = t0
p.downedUntil = t0 + DOWNED_MS
r.moveBank = { p: { accruedAt: t0, walk: 100, dash: 100, pad: true } }
r.lastMoveAt = { p: t0 }
r.moveGrant = { p: { dashUntil: t0 + 60_000 } }

assert(!requestSpawnRespawn(r, io, p, t0 + RESPAWN_UNLOCK_MS - 1), '5 秒前的重生要求應拒絕')
assert(p.hp === 0 && p.downedUntil === t0 + DOWNED_MS, '拒絕後應繼續倒地')
assert(p.position[0] === fallen[0] && p.position[2] === fallen[2], '拒絕後不該被送走')
assert(r.moveBank?.p?.walk === 100 && r.moveGrant?.p?.dashUntil, '拒絕時不該重設防瞬移基準')

const edge = player('edge', [fallen[0], fallen[1], fallen[2]])
edge.hp = 0
edge.downedAt = t0
edge.downedUntil = t0 + DOWNED_MS
const edgeRoom = room(edge)
assert(requestSpawnRespawn(edgeRoom, io, edge, t0 + RESPAWN_UNLOCK_MS), '滿 5 秒的重生要求應接受')
assert(edge.hp === PLAYER_MAX_HP && edge.downedUntil === 0 && atSpawn(edge.position), '滿 5 秒應回到出生點')

const when = t0 + RESPAWN_UNLOCK_MS + 1
const random = Math.random
Math.random = () => 0
let accepted = false
try {
  accepted = requestSpawnRespawn(r, io, p, when)
} finally {
  Math.random = random
}
assert(accepted, '5 秒後的重生要求應接受')
assert(p.hp === PLAYER_MAX_HP && p.downedUntil === 0 && p.downedAt === 0, '接受後應離開倒地')
assert(Math.hypot(p.position[0] - home.x, p.position[2] - home.z) < 0.05, '接受後應站在第一個出生點')
assert(!r.moveGrant?.p, '重生應清掉舊的衝刺授權')

const pulled = acceptMove(r as unknown as TagRoom, p, { position: fallen, rotationY: 0 }, when)
assert(!pulled, '重生後不該被拉回倒地點')
assert(Math.hypot(p.position[0] - home.x, p.position[2] - home.z) < 0.05, '被拒的舊座標應留在出生點')

const step = PLAYER_SPEED * 0.2
const stepped = acceptMove(r as unknown as TagRoom, p, { position: [home.x, home.y, home.z + step], rotationY: 0 }, when)
assert(stepped, '重生後第一筆正常步伐不該被拉回')
assert(Math.abs(p.position[2] - (home.z + step)) < 1e-6, '重生後的步伐應從新出生點往前')
assert(Math.hypot(p.position[0] - fallen[0], p.position[2] - fallen[2]) > 1, '走出去之後不該還在倒地點')

const late = player('late', [fallen[0], fallen[1], fallen[2]])
late.hp = 0
late.downedAt = t0
late.downedUntil = t0 + DOWNED_MS
const lateRoom = room(late)
assert(!requestSpawnRespawn(lateRoom, io, late, t0 + DOWNED_MS), '滿 15 秒的自願重生應拒絕')
assert(late.hp === 0 && late.downedUntil === t0 + DOWNED_MS, '15 秒當下應還留著倒地截止時間，等逾時處理')
tickDowned(lateRoom, io, t0 + DOWNED_MS)
assert(late.hp === PLAYER_MAX_HP && late.downedUntil === 0 && late.downedAt === 0, '滿 15 秒應由原本的逾時復活')
assert(atSpawn(late.position), '逾時復活應送到出生點')

const solo = player('solo', [home.x, home.y, home.z])
solo.hp = 0
solo.downedAt = t0
solo.downedUntil = t0 + DOWNED_SOLO_MS
const soloRoom = room(solo)
assert(!requestSpawnRespawn(soloRoom, io, solo, t0 + 1_000), '單人倒地未滿 5 秒仍應拒絕')
tickDowned(soloRoom, io, t0 + DOWNED_SOLO_MS)
assert(solo.hp === PLAYER_MAX_HP && solo.downedUntil === 0, '單人 3 秒逾時應照舊復活')

console.log('downed-respawn: ok')
