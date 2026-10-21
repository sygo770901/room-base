import { acceptMove, type TagRoom } from '../server/tag.ts'
import { stepMonsterToward } from '../server/combat.ts'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import type { PlayerState } from '../server/types.ts'
import { SPAWN_POINTS, hasLineOfSight } from '../shared/dungeon.ts'
import {
  MAX_STEP_UP,
  applyHeightOverride,
  canMoveTo,
  groundY,
  heightBlocksSight,
  type HeightField,
} from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import { DASH_DURATION_MS, JUMP_MAX_DELTA } from '../shared/movement.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function player(position: [number, number, number]): PlayerState {
  return {
    id: 'p',
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position,
    rotationY: 0,
    seated: null,
    role: 'host',
    hp: 100,
    team: 'hider',
  }
}

function room(scene: string, p: PlayerState, now: number): TagRoom {
  return {
    roomId: 'height',
    mode: 'hunt',
    scene: scene as TagRoom['scene'],
    players: { p },
    lastMoveAt: { p: now },
    moveGrant: {},
  }
}

function center(field: HeightField, cx: number, cz: number) {
  return {
    x: field.originX + (cx + 0.5) * field.cell,
    z: field.originZ + (cz + 0.5) * field.cell,
  }
}

assert(heightFieldOf('kenney') == null, 'kenney 不該有高度圖')
assert(heightFieldOf('kaykit') == null, 'kaykit 不該有高度圖')
assert(heightFieldOf('jungle') == null, 'jungle 不該有高度圖')
assert(heightFieldOf(undefined) == null, '沒地圖時不該有高度圖')

const kenneySpawn = spawnOf('kenney', 0)
assert(kenneySpawn.x === SPAWN_POINTS[0].x && kenneySpawn.z === SPAWN_POINTS[0].z && kenneySpawn.y === 0, '平面出生點不該改')
const kenneyNow = 2_000_000
const kenney = player([SPAWN_POINTS[0].x, 0, SPAWN_POINTS[0].z])
const kenneyRoom = room('kenney', kenney, kenneyNow)
assert(
  acceptMove(kenneyRoom, kenney, { position: [kenney.position[0], 0, kenney.position[2] + 0.4], rotationY: 0 }, kenneyNow + 200),
  '平面地圖一小步仍該接受',
)
assert(
  acceptMove(kenneyRoom, kenney, { position: [kenney.position[0], 2.2, kenney.position[2]], rotationY: 0 }, kenneyNow + 280),
  '平面沒跳卻升空應被拉回地面，而不是整包拒絕',
)
assert((kenney.position[1] ?? 0) <= 0.2, `平面拉回地面失敗 y=${kenney.position[1]}`)
assert(hasLineOfSight(SPAWN_POINTS[0].x, SPAWN_POINTS[0].z, SPAWN_POINTS[0].x + 0.4, SPAWN_POINTS[0].z), '平面短視線不該被高度圖改掉')

const field = heightFieldOf('heightlab')
assert(field != null, 'heightlab 要有高度圖')
if (!field) throw new Error('heightlab')
assert(field.stairs.length > 0, '高度圖要有樓梯')
assert(field.cells.some((c) => c != null && c > 2), '高度圖要有高台')
assert(Math.abs((groundY(field, 14.5, 18.5) ?? -1) - 4) < 0.05, '手動 override 應把樓梯頂缺口補成 4')

const overridden = applyHeightOverride(field, { walls: [[14, 8]] })
assert(groundY(overridden, 14.5, 8.5) == null, 'override 應能把可走格改成牆')

let stairUp = 0
let stairFrom = 0
{
  const m = { x: field.patrol[0].x, z: field.patrol[0].z, rotationY: 0, kind: 'grunt' as const, y: 0 }
  stairFrom = groundY(field, m.x, m.z) ?? 0
  const goal = field.patrol[field.patrol.length - 1]
  for (let i = 0; i < 500; i++) {
    const step = stepMonsterToward('heightlab', m, goal.x, goal.z, 4, 0.1)
    if (step.remain < 0.8) break
  }
  stairUp = m.y ?? groundY(field, m.x, m.z) ?? 0
  assert(stairUp > stairFrom + 1.5, `怪物該走上高台，起點 ${stairFrom.toFixed(2)} 終點 ${stairUp.toFixed(2)} @ ${m.x.toFixed(1)},${m.z.toFixed(1)}`)
  assert(Math.hypot(m.x - goal.x, m.z - goal.z) < 1.2, `怪物該到達巡邏終點，現在 ${m.x.toFixed(2)},${m.z.toFixed(2)}`)
  const back = { x: m.x, z: m.z, rotationY: 0, kind: 'grunt' as const, y: m.y }
  for (let i = 0; i < 500; i++) {
    const step = stepMonsterToward('heightlab', back, field.patrol[0].x, field.patrol[0].z, 4, 0.1)
    if (step.remain < 0.8) break
  }
  const down = back.y ?? 99
  assert(down < stairUp - 1.5, `走下樓梯應降回地面，現在 y=${down.toFixed(2)}`)
}

let wallBlocked = false
let cliff: { fx: number; fz: number; fy: number; tx: number; tz: number; ty: number } | null = null
for (let cz = 0; cz < field.rows && !cliff; cz++) {
  for (let cx = 0; cx < field.cols - 1; cx++) {
    const a = center(field, cx, cz)
    const b = center(field, cx + 1, cz)
    const ay = groundY(field, a.x, a.z)
    const by = groundY(field, b.x, b.z)
    if (ay == null && by != null && !wallBlocked) {
      const moved = resolvePlayerMove(b.x, b.z, -0.7, 0, [], 0.26, [], by, [], field)
      if (moved.x === b.x && moved.z === b.z) wallBlocked = true
    }
    if (ay != null && by != null && Math.abs(by - ay) > MAX_STEP_UP && Math.abs(by - ay) < JUMP_MAX_DELTA) {
      const low = ay < by ? { x: a.x, z: a.z, y: ay } : { x: b.x, z: b.z, y: by }
      const high = ay < by ? { x: b.x, z: b.z, y: by } : { x: a.x, z: a.z, y: ay }
      cliff = { fx: low.x, fz: low.z, fy: low.y, tx: high.x, tz: high.z, ty: high.y }
    }
  }
}
assert(wallBlocked, '走進牆應停在原地')
assert(cliff != null, '要有一座跳得到、但走不上去的斷崖')
if (!cliff) throw new Error('cliff')
assert(!canMoveTo(field, cliff.fx, cliff.fz, cliff.tx, cliff.tz, 0.26), '斷崖不該走上去')
assert(canMoveTo(field, cliff.tx, cliff.tz, cliff.fx, cliff.fz, 0.26), '從高台摔下去應該可以')

const now = 8_000_000
const cheat = player([cliff.fx, cliff.fy, cliff.fz])
const cheatRoom = room('heightlab', cheat, now)
cheatRoom.moveGrant = { p: { dashUntil: now + DASH_DURATION_MS, jumpUntil: now + 800 } }
const tele = acceptMove(
  cheatRoom,
  cheat,
  { position: [cliff.tx, cliff.ty, cliff.tz], rotationY: 0 },
  now + 400,
)
assert(!tele, '有衝刺和跳躍也不該瞬移上斷崖平台')
assert(cheat.position[0] === cliff.fx && cheat.position[2] === cliff.fz, '拒絕後應留在斷崖下')

const fall = player([cliff.tx, cliff.ty, cliff.tz])
const fallRoom = room('heightlab', fall, now)
const fell = acceptMove(fallRoom, fall, { position: [cliff.fx, cliff.fy, cliff.fz], rotationY: 0 }, now + 400)
assert(fell, '摔下斷崖的移動該被接受')

const openA = field.spawns[0]
const openB = { x: openA.x, z: openA.z + 1.2 }
assert(!heightBlocksSight(field, openA.x, 0.05, openA.z, openB.x, 0.05, openB.z), '平地短距離不該擋視線')
assert(!heightBlocksSight(null, 0, 0, 0, 3, 0, 0), '沒有高度圖時視線規則不該多擋')

let blockedSight = false
for (let cz = 1; cz < field.rows - 1 && !blockedSight; cz++) {
  for (let cx = 1; cx < field.cols - 1; cx++) {
    const y = groundY(field, cx + 0.5, cz + 0.5)
    if (y == null || y > 0.4) continue
    if (groundY(field, cx + 0.5, cz + 1.5) != null) continue
    if (groundY(field, cx + 0.5, cz + 2.5) == null) continue
    blockedSight = heightBlocksSight(field, cx + 0.5, y, cz + 0.5, cx + 0.5, 0, cz + 2.5)
    if (blockedSight) break
  }
}
assert(blockedSight, '牆應擋住鬼抓人視線')

console.log('height: ok', {
  stairs: field.stairs.length,
  climbed: Number(stairUp.toFixed(2)),
  cliffRise: Number((cliff.ty - cliff.fy).toFixed(2)),
})
