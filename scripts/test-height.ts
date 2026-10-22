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
  unreachableFromSpawn,
  type HeightField,
} from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import { DASH_DURATION_MS, JUMP_MAX_DELTA } from '../shared/movement.ts'
import { GRAVITY, JUMP_SPEED } from '../shared/platforms.ts'

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
assert(!tele, '有衝刺和跳躍也不該一包瞬移上斷崖')
assert(cheat.position[0] === cliff.fx && cheat.position[2] === cliff.fz, '拒絕後應留在斷崖下')

{
  const walker = player([cliff.fx, cliff.fy, cliff.fz])
  const walkRoom = room('heightlab', walker, now)
  const dx = cliff.tx - cliff.fx
  const dz = cliff.tz - cliff.fz
  const span = Math.hypot(dx, dz) || 1
  let blockedWalk = false
  let at = now
  for (let i = 1; i <= 8; i++) {
    const nx = cliff.fx + (dx / span) * 0.2 * i
    const nz = cliff.fz + (dz / span) * 0.2 * i
    const ok = acceptMove(walkRoom, walker, { position: [nx, cliff.fy, nz], rotationY: 0 }, at + i * 80)
    if (!ok) {
      blockedWalk = true
      break
    }
  }
  assert(blockedWalk, '直線走不該爬上 0.65–1.2m 的斷崖')
  const stayed = groundY(field, walker.position[0], walker.position[2]) ?? 99
  assert(stayed < cliff.ty - 0.4, `走上去之後還在低處，實際地面 ${stayed}`)
}

{
  const jumper = player([cliff.fx, cliff.fy, cliff.fz])
  const jumpRoom = room('heightlab', jumper, now + 10_000)
  const t0 = now + 10_000
  jumpRoom.moveGrant = { p: { jumpUntil: t0 + 1100 } }
  const dx = cliff.tx - cliff.fx
  const dz = cliff.tz - cliff.fz
  const span = Math.hypot(dx, dz) || 1
  const ux = dx / span
  const uz = dz / span
  let sim = 0
  let x = cliff.fx
  let z = cliff.fz
  let accepted = 0
  const arcY = () => cliff.fy + JUMP_SPEED * sim - 0.5 * GRAVITY * sim * sim
  const send = (px: number, py: number, pz: number) => {
    const at = t0 + Math.round(sim * 1000)
    const ok = acceptMove(jumpRoom, jumper, { position: [px, py, pz], rotationY: 0 }, at)
    assert(ok, `跳躍弧線被拒 x=${px.toFixed(2)} z=${pz.toFixed(2)} y=${py.toFixed(2)} sim=${sim.toFixed(2)}`)
    accepted += 1
  }
  while (sim < 0.7 && arcY() < cliff.ty + 0.15) {
    sim += 0.05
    send(x, arcY(), z)
  }
  assert(arcY() >= cliff.ty, `起跳後腳要高過斷崖，實際 ${arcY().toFixed(2)} 目標 ${cliff.ty}`)
  let guard = 0
  while (Math.hypot(cliff.tx - x, cliff.tz - z) > 0.2 && guard < 20) {
    guard += 1
    sim += 0.05
    const rise = JUMP_SPEED - GRAVITY * sim
    if (rise < -0.2) break
    x += ux * 0.2
    z += uz * 0.2
    const y = Math.max(cliff.ty, arcY())
    send(x, y, z)
  }
  while (arcY() > cliff.ty && sim < 1.05) {
    sim += 0.05
    const y = Math.max(cliff.ty, arcY())
    send(x, y, z)
  }
  send(x, cliff.ty, z)
  const landed = groundY(field, jumper.position[0], jumper.position[2])
  assert(landed != null && Math.abs(landed - cliff.ty) < 0.08, `應落在斷崖上，地面 ${landed} @ ${jumper.position[0].toFixed(2)},${jumper.position[2].toFixed(2)}`)
  assert(Math.abs((jumper.position[1] ?? 0) - cliff.ty) < 0.08, `落地高度應貼著斷崖，y=${jumper.position[1]}`)
  assert(accepted >= 8, '跳躍弧線要有多包移動，不是一包瞬移')
}

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

const sealed = unreachableFromSpawn(field)
assert(sealed.length === 0, `每個可行走格都要走得回出生點，封住的有 ${sealed.slice(0, 8).join(' ')}`)

let floorSplit = false
for (let cz = 0; cz < field.rows && !floorSplit; cz++) {
  for (let cx = 0; cx < field.cols; cx++) {
    const low = groundY(field, cx + 0.5, cz + 0.5)
    const high = groundY(field, cx + 0.5, cz + 0.5 + 6)
    if (low == null || high == null || high < low + 2) continue
    floorSplit = heightBlocksSight(field, cx + 0.5, low, cz + 0.5, cx + 0.5, high, cz + 6.5)
    if (floorSplit) break
  }
}
assert(floorSplit, '樓板兩側的視線應被擋住')

console.log('height: ok', {
  stairs: field.stairs.length,
  climbed: Number(stairUp.toFixed(2)),
  cliffRise: Number((cliff.ty - cliff.fy).toFixed(2)),
})

const sample = heightFieldOf('sample')
assert(sample != null, '寶物房要有高度圖')
if (!sample) throw new Error('sample')
assert(unreachableFromSpawn(sample).length === 0, '寶物房有走不回出生點的格子')
const sampleSpawn = spawnOf('sample', 0)
assert(Math.abs(sampleSpawn.x - 30) < 0.01 && Math.abs(sampleSpawn.z - 246) < 0.01, '寶物房出生點應在走廊')
assert(Math.abs(sampleSpawn.y) < 0.05, `出生點應在地面，y=${sampleSpawn.y}`)
assert(Math.abs((groundY(sample, 46, 232) ?? -1) - 4) < 0.05, '高台應是高度 4')

function walkSample(
  field: HeightField,
  x: number,
  z: number,
  dx: number,
  dz: number,
  n: number,
  pred?: (x: number, z: number, y: number) => boolean,
) {
  const space = { minX: 18, maxX: 54, minZ: 218, maxZ: 270, walkable: () => true }
  let y = groundY(field, x, z) ?? 0
  for (let i = 0; i < n; i++) {
    if (pred?.(x, z, y)) return { x, z, y, stuck: false }
    const moved = resolvePlayerMove(x, z, dx, dz, [], 0.26, [], y, [], field, space)
    if (Math.hypot(moved.x - x, moved.z - z) < 0.001) return { x, z, y, stuck: true }
    x = moved.x
    z = moved.z
    y = groundY(field, x, z) ?? y
  }
  return { x, z, y, stuck: false }
}

{
  const approach = walkSample(sample, 30, 246, 0, -0.28, 80, (_x, z) => z <= 232)
  assert(!approach.stuck && approach.z <= 232.1, `走不到樓梯口 ${approach.z}`)
  const platform = walkSample(sample, approach.x, approach.z, 0.22, 0, 120, (x, _z, y) => y >= 3.95 && x >= 42)
  assert(platform.y >= 3.95 && platform.x >= 42, `走不上高度 4 的高台，y=${platform.y.toFixed(2)} @ ${platform.x.toFixed(1)},${platform.z.toFixed(1)}`)
  // 樓梯兩側是牆和柱，不是可以走下去的缺口。走廊地面不該走回 4m 高台。
  assert((groundY(sample, 34, 226) ?? 99) < 0.2, '高台西側的走廊應在地面')
  assert((groundY(sample, 42, 226) ?? 0) > 3.5, '高台本體應是 4')
  assert(!canMoveTo(sample, 34, 226, 42, 226, 0.26), '高台斷崖不該走得上去')
  const down = walkSample(sample, platform.x, platform.z, -0.22, 0, 80, (x, _z, y) => x <= 33.2 && y <= 1.05)
  assert(!down.stuck && down.y <= 1.05, `走不下樓梯 y=${down.y} x=${down.x}`)
  const west = walkSample(sample, down.x, down.z, -0.25, 0, 40, (x) => x <= 30)
  assert(west.x <= 30.05, `下樓後靠不回走廊 x=${west.x}`)
  const home = walkSample(sample, 30, west.z, 0, 0.28, 90, (x, z) => Math.hypot(x - 30, z - 246) < 1.2)
  assert(Math.hypot(home.x - 30, home.z - 246) < 1.2, `下樓後走不回出生點 ${home.x.toFixed(1)},${home.z.toFixed(1)}`)
  const wall = walkSample(sample, 30, 224, 0, -0.25, 30)
  assert(wall.stuck && wall.z > 219.5, `穿得過南牆，停在 z=${wall.z}`)
  console.log('sample-height: ok', {
    platform: Number(platform.y.toFixed(2)),
    down: Number(down.y.toFixed(2)),
    home: [Number(home.x.toFixed(2)), Number(home.z.toFixed(2))],
  })
}
