/**
 * 每張圖的伺服器可行走範圍要蓋住整張可見地圖。
 * 從出生點走到最遠的可行走點，acceptMove 都要收下；再往外一步要被拒。
 */
import { acceptMove, recordMoveOrigin, type TagRoom } from '../server/tag.ts'
import type { PlayerState } from '../server/types.ts'
import { createDoors } from '../shared/doors.ts'
import { CELL, isFloorCell, MAP_H, MAP_W } from '../shared/dungeon.ts'
import { PLAYER_RADIUS } from '../shared/furniture.ts'
import { canMoveTo, cellCoord, groundY } from '../shared/heightfield.ts'
import { samplePathClear } from '../shared/sampleCollision.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import { doorsOf } from '../shared/mapData.ts'
import { worldBoundsOf } from '../shared/mapView.ts'
import { PLAYER_FOOT_RADIUS } from '../shared/platforms.ts'
import { sceneMoveArgs } from '../shared/sceneMotion.ts'
import { SCENE_IDS, type SceneId } from '../shared/scenes.ts'
import { resolvePlayerMove } from '../src/physics/collision.ts'

const EDGE = 16

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function playerAt(scene: SceneId, x: number, y: number, z: number): PlayerState {
  return {
    id: 'p',
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position: [x, y, z],
    rotationY: 0,
    seated: null,
    role: 'host',
    hp: 100,
    team: 'hider',
  }
}

function roomFor(scene: SceneId, p: PlayerState): TagRoom {
  return {
    roomId: `bounds-${scene}`,
    mode: 'boss',
    scene,
    players: { p },
    doors: createDoors(doorsOf(scene)),
    lastMoveAt: {},
    moveGrant: {},
    moveBank: {},
  }
}

type Point = { x: number; z: number }

function flatOpen(scene: SceneId, from: Point, to: Point) {
  const args = sceneMoveArgs(scene, createDoors(doorsOf(scene)))
  const moved = resolvePlayerMove(
    from.x,
    from.z,
    to.x - from.x,
    to.z - from.z,
    [],
    PLAYER_RADIUS,
    args.extra,
    0,
    args.platforms,
    null,
  )
  return Math.hypot(moved.x - to.x, moved.z - to.z) < 0.05
}

function reachableFlat(scene: SceneId, spawn: Point) {
  const sx = Math.floor(spawn.x / CELL)
  const sz = Math.floor(spawn.z / CELL)
  const key = (x: number, z: number) => `${x},${z}`
  const parent = new Map<string, string | null>([[key(sx, sz), null]])
  const q: [number, number][] = [[sx, sz]]
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  while (q.length) {
    const [gx, gz] = q.shift()!
    const from = { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL }
    for (const [dx, dz] of dirs) {
      const nx = gx + dx
      const nz = gz + dz
      const id = key(nx, nz)
      if (parent.has(id) || !isFloorCell(nx, nz)) continue
      const to = { x: (nx + 0.5) * CELL, z: (nz + 0.5) * CELL }
      if (!flatOpen(scene, from, to)) continue
      parent.set(id, key(gx, gz))
      q.push([nx, nz])
    }
  }
  return parent
}

function reachableHeight(scene: SceneId, spawn: Point) {
  const field = heightFieldOf(scene)
  if (!field) throw new Error(`${scene} 沒有高度圖`)
  if (field.id === 'sample') return reachableSample(field, spawn)
  const start = cellCoord(field, spawn.x, spawn.z)
  if (!start) throw new Error(`${scene} 出生點在高度圖外`)
  const key = (x: number, z: number) => `${x},${z}`
  const parent = new Map<string, string | null>([[key(start.cx, start.cz), null]])
  const q = [start]
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  while (q.length) {
    const cur = q.pop()!
    const ax = field.originX + (cur.cx + 0.5) * field.cell
    const az = field.originZ + (cur.cz + 0.5) * field.cell
    for (const [dx, dz] of dirs) {
      const cx = cur.cx + dx
      const cz = cur.cz + dz
      const id = key(cx, cz)
      if (parent.has(id)) continue
      if (cx < 0 || cz < 0 || cx >= field.cols || cz >= field.rows) continue
      const bx = field.originX + (cx + 0.5) * field.cell
      const bz = field.originZ + (cz + 0.5) * field.cell
      if (groundY(field, bx, bz) == null) continue
      if (!canMoveTo(field, ax, az, bx, bz, PLAYER_FOOT_RADIUS)) continue
      parent.set(id, key(cur.cx, cur.cz))
      q.push({ cx, cz })
    }
  }
  return parent
}

/** 寶物房的 1m 格心會切過寶箱。改用 0.5m，並繞開道具。 */
function reachableSample(field: NonNullable<ReturnType<typeof heightFieldOf>>, spawn: Point) {
  const step = 0.5
  const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`
  const snap = (n: number) => Math.round(n * 100) / 100
  const parent = new Map<string, string | null>([[key(spawn.x, spawn.z), null]])
  const q = [{ x: spawn.x, z: spawn.z }]
  const dirs = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
  ] as const
  while (q.length) {
    const cur = q.pop()!
    for (const [dx, dz] of dirs) {
      const nx = snap(cur.x + dx)
      const nz = snap(cur.z + dz)
      const id = key(nx, nz)
      if (parent.has(id)) continue
      if (groundY(field, nx, nz) == null) continue
      if (!canMoveTo(field, cur.x, cur.z, nx, nz, PLAYER_FOOT_RADIUS)) continue
      if (!samplePathClear(cur.x, cur.z, nx, nz, PLAYER_FOOT_RADIUS)) continue
      parent.set(id, key(cur.x, cur.z))
      q.push({ x: nx, z: nz })
    }
  }
  return parent
}

function pointsOf(scene: SceneId, parent: Map<string, string | null>) {
  const field = heightFieldOf(scene)
  const out: Point[] = []
  for (const id of parent.keys()) {
    const [a, b] = id.split(',').map(Number)
    if (field?.id === 'sample') {
      out.push({ x: a, z: b })
    } else if (field) {
      out.push({
        x: field.originX + (a + 0.5) * field.cell,
        z: field.originZ + (b + 0.5) * field.cell,
      })
    } else {
      out.push({ x: (a + 0.5) * CELL, z: (b + 0.5) * CELL })
    }
  }
  return out
}

function extremes(points: Point[]) {
  let minX = points[0]
  let maxX = points[0]
  let minZ = points[0]
  let maxZ = points[0]
  for (const p of points) {
    if (p.x < minX.x) minX = p
    if (p.x > maxX.x) maxX = p
    if (p.z < minZ.z) minZ = p
    if (p.z > maxZ.z) maxZ = p
  }
  return [minX, maxX, minZ, maxZ]
}

function pathTo(scene: SceneId, parent: Map<string, string | null>, goal: Point): Point[] {
  const field = heightFieldOf(scene)
  const key =
    field?.id === 'sample'
      ? `${goal.x.toFixed(2)},${goal.z.toFixed(2)}`
      : field
        ? `${Math.floor((goal.x - field.originX) / field.cell)},${Math.floor((goal.z - field.originZ) / field.cell)}`
        : `${Math.floor(goal.x / CELL)},${Math.floor(goal.z / CELL)}`
  const cells: string[] = []
  let cur: string | null | undefined = key
  while (cur) {
    cells.push(cur)
    cur = parent.get(cur)
  }
  cells.reverse()
  return pointsOf(scene, new Map(cells.map((id) => [id, null])))
}

function walk(scene: SceneId, steps: Point[]) {
  const field = heightFieldOf(scene)
  const y0 = field ? (groundY(field, steps[0].x, steps[0].z) ?? 0) : 0
  const p = playerAt(scene, steps[0].x, y0, steps[0].z)
  const room = roomFor(scene, p)
  const t0 = 5_000_000
  recordMoveOrigin(room, p.id, t0)
  for (let i = 1; i < steps.length; i++) {
    const y = field ? (groundY(field, steps[i].x, steps[i].z) ?? 0) : 0
    const at = t0 + i * 1000
    const ok = acceptMove(room, p, { position: [steps[i].x, y, steps[i].z], rotationY: 0 }, at)
    if (!ok) {
      throw new Error(
        `${scene} 走到 ${steps[i].x.toFixed(1)},${steps[i].z.toFixed(1)} 被拒，停在 ${p.position[0].toFixed(1)},${p.position[2].toFixed(1)}`,
      )
    }
  }
  return p
}

function rejectPast(scene: SceneId, from: Point, to: Point) {
  const field = heightFieldOf(scene)
  const y0 = field ? (groundY(field, from.x, from.z) ?? 0) : 0
  const y1 = field ? (groundY(field, to.x, to.z) ?? y0) : 0
  const p = playerAt(scene, from.x, y0, from.z)
  const room = roomFor(scene, p)
  const t0 = 9_000_000
  recordMoveOrigin(room, p.id, t0)
  const ok = acceptMove(room, p, { position: [to.x, y1, to.z], rotationY: 0 }, t0 + 1000)
  assert(!ok, `${scene} 不該走出地圖到 ${to.x.toFixed(1)},${to.z.toFixed(1)}`)
  assert(p.position[0] === from.x && p.position[2] === from.z, `${scene} 被拒後應留在原地`)
}

for (const scene of SCENE_IDS) {
  const spawn = spawnOf(scene, 0)
  const parent = heightFieldOf(scene) ? reachableHeight(scene, spawn) : reachableFlat(scene, spawn)
  const points = pointsOf(scene, parent)
  assert(points.length > 4, `${scene} 出生點幾乎走不出去（${points.length}）`)
  const [minX, maxX, minZ, maxZ] = extremes(points)
  const bounds = worldBoundsOf(scene)
  assert(minX.x <= bounds.minX + EDGE, `${scene} 最西只到 ${minX.x}，可見範圍從 ${bounds.minX}`)
  assert(maxX.x >= bounds.maxX - EDGE, `${scene} 最東只到 ${maxX.x}，可見範圍到 ${bounds.maxX}`)
  assert(minZ.z <= bounds.minZ + EDGE, `${scene} 最南只到 ${minZ.z}，可見範圍從 ${bounds.minZ}`)
  assert(maxZ.z >= bounds.maxZ - EDGE, `${scene} 最北只到 ${maxZ.z}，可見範圍到 ${bounds.maxZ}`)

  for (const goal of [minX, maxX, minZ, maxZ]) {
    const steps = pathTo(scene, parent, goal)
    assert(steps.length > 1, `${scene} 到 ${goal.x},${goal.z} 沒有路`)
    const arrived = walk(scene, steps)
    const left = Math.hypot(arrived.position[0] - goal.x, arrived.position[2] - goal.z)
    assert(left < 0.2, `${scene} 伺服器停在 ${arrived.position[0]},${arrived.position[2]}，沒到 ${goal.x},${goal.z}`)
  }

  const east = { x: maxX.x + (heightFieldOf(scene)?.cell ?? CELL), z: maxX.z }
  rejectPast(scene, maxX, east)
  if (!heightFieldOf(scene)) {
    assert(MAP_W * CELL === bounds.maxX && MAP_H * CELL === bounds.maxZ, `${scene} 平面邊界不是整座地城`)
  }
  console.log(
    scene,
    'reach',
    points.length,
    'corners',
    `${minX.x},${minZ.z}`,
    `${maxX.x},${maxZ.z}`,
  )
}

console.log('map-bounds: ok', SCENE_IDS.join(','))
