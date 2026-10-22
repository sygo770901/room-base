/**
 * 寶物房：0.25m 格子、八個方向都走得出去；腳不能穿進道具或牆，也不能懸空超過 0.15m。
 *   npx tsx scripts/test-sample-collision.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import { canMoveTo, groundY, unreachableFromSpawn } from '../shared/heightfield.ts'
import { heightFieldOf } from '../shared/heightmaps.ts'
import { sampleCanStep } from '../shared/sampleCollision.ts'
import {
  SAMPLE_BOUNDS,
  SAMPLE_SOLIDS,
  sampleSolidHit,
  sampleSpikeAt,
  sampleSurfaceY,
} from '../shared/sampleRoom.ts'

const R = 0.26
const STEP = 0.25

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const field = heightFieldOf('sample')
assert(field != null, '寶物房要有高度圖')
if (!field) throw new Error('sample')

assert(unreachableFromSpawn(field).length === 0, '補過的地板仍要走得回出生點')

assert(Math.abs((groundY(field, 32.5, 232) ?? -1) - 0.5) < 0.001, '第一階應是 0.5')
assert(Math.abs((groundY(field, 36.5, 232) ?? -1) - 2.5) < 0.001, '中段踏面應是 2.5，不是斜坡')
assert(Math.abs((groundY(field, 39.5, 232) ?? -1) - 4) < 0.001, '最上面一階應是 4')
assert(Math.abs((groundY(field, 40.5, 224.5) ?? -1) - 4) < 0.001, '高台邊緣不該被挖空')
assert(Math.abs((groundY(field, 44, 224.2) ?? -1) - 4) < 0.001, '高台南緣應是 4')
assert(groundY(field, 22, 262) == null, '地刺不該當地面')
assert(sampleSpikeAt(22, 262), '地刺範圍')
assert(sampleSolidHit(25.2, 261, 0, R), '寶箱中心要擋住人')
assert(sampleSolidHit(28.5, 251.5, 0, R), '門柱要擋住人')
assert(!sampleSolidHit(30, 251.5, 0, R), '門口中間要過得去')
assert(sampleSolidHit(36, 230.05, 0, R), '扶手不能站')
assert(!sampleSolidHit(36.5, 232, 2.5, R), '踏面中央不是實心')

const dirs: [number, number][] = []
for (const [dx, dz] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const) {
  const len = Math.hypot(dx, dz)
  dirs.push([(dx / len) * STEP, (dz / len) * STEP])
}

function standable(x: number, z: number) {
  const y = groundY(field, x, z)
  if (y == null) return false
  if (!canMoveTo(field, x, z, x, z, R)) return false
  if (sampleSolidHit(x, z, y, R)) return false
  return true
}

let points = 0
let trapped: string[] = []
let overlap: string[] = []
let floated: string[] = []
const ixMax = Math.round((SAMPLE_BOUNDS.maxX - SAMPLE_BOUNDS.minX) / STEP)
const izMax = Math.round((SAMPLE_BOUNDS.maxZ - SAMPLE_BOUNDS.minZ) / STEP)
for (let ix = 0; ix <= ixMax; ix++) {
  const x = SAMPLE_BOUNDS.minX + ix * STEP
  for (let iz = 0; iz <= izMax; iz++) {
    const z = SAMPLE_BOUNDS.minZ + iz * STEP
    if (!standable(x, z)) continue
    points++
    const y = groundY(field, x, z) ?? 0
    if (sampleSolidHit(x, z, y, R)) overlap.push(`${x},${z}`)
    const surface = expectedSurface(x, z)
    if (surface == null || Math.abs(y - surface) > 0.15) {
      if (floated.length < 12) floated.push(`${x.toFixed(2)},${z.toFixed(2)} y=${y} mesh=${surface}`)
    }
    let left = false
    for (const [dx, dz] of dirs) {
      if (sampleCanStep(x, z, x + dx, z + dz, R)) {
        left = true
        break
      }
    }
    if (!left && trapped.length < 12) trapped.push(`${x.toFixed(2)},${z.toFixed(2)}`)
  }
}

assert(points > 500, `可行走的點太少 ${points}`)
assert(trapped.length === 0, `進得去出不來：${trapped.join(' ')}`)
assert(overlap.length === 0, `站點穿進模型：${overlap.join(' ')}`)
assert(floated.length === 0, `腳懸空或埋進地面超過 0.15m：${floated.join(' | ')}`)

assert(standable(30, 246), '出生點要站得住')
let spawnLeaves = false
for (const [dx, dz] of dirs) {
  if (sampleCanStep(30, 246, 30 + dx, 246 + dz, R)) spawnLeaves = true
}
assert(spawnLeaves, '出生點要走得出去')

const space = { minX: 18, maxX: 54, minZ: 218, maxZ: 270, walkable: () => true }

function walk(x: number, z: number, dx: number, dz: number, n: number, pred: (x: number, z: number, y: number) => boolean) {
  let y = groundY(field, x, z) ?? 0
  for (let i = 0; i < n; i++) {
    if (pred(x, z, y)) return { x, z, y, stuck: false }
    const moved = resolvePlayerMove(x, z, dx, dz, [], R, [], y, [], field, space)
    if (Math.hypot(moved.x - x, moved.z - z) < 0.001) return { x, z, y, stuck: true }
    const surface = expectedSurface(moved.x, moved.z)
    const next = groundY(field, moved.x, moved.z)
    if (next == null || surface == null || Math.abs(next - surface) > 0.15) {
      throw new Error(`走路時腳離模型 ${moved.x.toFixed(2)},${moved.z.toFixed(2)} y=${next} mesh=${surface}`)
    }
    if (sampleSolidHit(moved.x, moved.z, next, R)) {
      throw new Error(`走路穿進模型 ${moved.x.toFixed(2)},${moved.z.toFixed(2)}`)
    }
    x = moved.x
    z = moved.z
    y = next
  }
  return { x, z, y, stuck: false }
}

{
  const up = walk(33, 232, STEP, 0, 40, (x, _z, y) => x >= 40 && y >= 3.95)
  assert(!up.stuck && up.y >= 3.95 && up.x >= 40, `走不上樓梯 ${up.x.toFixed(2)},${up.y.toFixed(2)} stuck=${up.stuck}`)
  const down = walk(up.x, up.z, -STEP, 0, 40, (x, _z, y) => x <= 33 && y <= 1.05)
  assert(!down.stuck && down.x <= 33.05 && down.y <= 1.05, `走不下樓梯 ${down.x.toFixed(2)},${down.y.toFixed(2)}`)
}

{
  const edge = walk(48.8, 232, 0, -STEP, 40, (_x, z, y) => z <= 225.2 && y >= 3.9)
  assert(!edge.stuck && edge.y >= 3.9 && edge.z <= 225.3, `高台邊緣走不到 ${edge.z.toFixed(2)} stuck=${edge.stuck}`)
  let x = edge.x
  let z = edge.z
  let y = edge.y
  for (let i = 0; i < 16; i++) {
    const moved = resolvePlayerMove(x, z, 0, -STEP, [], R, [], y, [], field, space)
    if (Math.hypot(moved.x - x, moved.z - z) < 0.001) break
    x = moved.x
    z = moved.z
    y = groundY(field, x, z) ?? y
  }
  assert(z >= 224.15 && z <= 224.6 && y >= 3.9, `高台南牆被走穿，停在 z=${z.toFixed(2)} y=${y.toFixed(2)}`)
}

let props = 0
for (const solid of SAMPLE_SOLIDS) {
  if (solid.kind !== 'prop') continue
  props++
  const cx = (solid.minX + solid.maxX) / 2
  const cz = (solid.minZ + solid.maxZ) / 2
  const feet = groundY(field, cx, cz) ?? solid.minY
  assert(sampleSolidHit(cx, cz, Math.max(feet, solid.minY), R), `道具中心沒有碰撞 ${cx.toFixed(1)},${cz.toFixed(1)}`)
  let touched = false
  for (let dist = 0.35; dist <= 2.6 && !touched; dist += 0.15) {
    for (let a = 0; a < 16 && !touched; a++) {
      const ang = (a / 16) * Math.PI * 2
      const sx = cx + Math.cos(ang) * dist
      const sz = cz + Math.sin(ang) * dist
      if (!standable(sx, sz)) continue
      let x = sx
      let z = sz
      let blocked = false
      for (let i = 0; i < 30; i++) {
        const dx = cx - x
        const dz = cz - z
        const len = Math.hypot(dx, dz) || 1
        const y = groundY(field, x, z) ?? 0
        const moved = resolvePlayerMove(x, z, (dx / len) * 0.12, (dz / len) * 0.12, [], R, [], y, [], field, space)
        if (Math.hypot(moved.x - x, moved.z - z) < 0.001) {
          blocked = true
          break
        }
        x = moved.x
        z = moved.z
      }
      if (!blocked) continue
      const y = groundY(field, x, z) ?? 0
      if (sampleSolidHit(x, z, y, R)) continue
      let left = false
      for (const [dx, dz] of dirs) {
        if (sampleCanStep(x, z, x + dx, z + dz, R)) left = true
      }
      if (left) touched = true
    }
  }
  assert(touched, `道具撞上去退不回來 ${cx.toFixed(2)},${cz.toFixed(2)}`)
}
assert(props >= 8, `道具太少 ${props}`)

/** 踏面實測：整數處立面約 0.05m，0.25m 之後是平的。其餘地板是 0 或 4。 */
function expectedSurface(x: number, z: number): number | null {
  if (x >= 32 && x < 40 && z >= 230.4 && z <= 233.7) {
    const k = Math.floor(x - 32)
    const frac = x - 32 - k
    const high = (k + 1) * 0.5
    if (frac < 0.25) return high - 0.05 + 0.05 * (frac / 0.25)
    return high
  }
  return sampleSurfaceY(x, z)
}

// 跟 stairs_long 的網格對一下中線，避免公式和模型分開走。
{
  const mesh = stairMeshTop()
  for (let x = 32.25; x <= 39.75; x += 0.25) {
    const y = groundY(field, x, 232)
    const top = mesh(x, 232)
    assert(y != null && top != null && Math.abs(y - top) <= 0.15, `踏面 ${x} ground=${y} mesh=${top}`)
  }
}

console.log('sample-collision: ok', { points, props, stairs: field.stairs.length })

function stairMeshTop() {
  const file = resolve(import.meta.dirname, '../public/assets/kaykit/dungeon-1.1/stairs_long.gltf')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  const bin = readFileSync(resolve(file, '..', json.buffers[0].uri))
  const tris: { a: number[]; b: number[]; c: number[]; ny: number }[] = []
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const pa = json.accessors[prim.attributes.POSITION]
      const ia = json.accessors[prim.indices]
      const pv = json.bufferViews[pa.bufferView]
      const iv = json.bufferViews[ia.bufferView]
      const p0 = (pv.byteOffset ?? 0) + (pa.byteOffset ?? 0)
      const i0 = (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0)
      const ps = pv.byteStride ?? 12
      const vert = (i: number) => [bin.readFloatLE(p0 + i * ps), bin.readFloatLE(p0 + i * ps + 4), bin.readFloatLE(p0 + i * ps + 8)]
      for (let i = 0; i + 2 < ia.count; i += 3) {
        const readI = (k: number) => (ia.componentType === 5123 ? bin.readUInt16LE(i0 + (i + k) * 2) : bin.readUInt32LE(i0 + (i + k) * 4))
        const a = vert(readI(0))
        const b = vert(readI(1))
        const c = vert(readI(2))
        const ux = b[0] - a[0]
        const uy = b[1] - a[1]
        const uz = b[2] - a[2]
        const vx = c[0] - a[0]
        const vy = c[1] - a[1]
        const vz = c[2] - a[2]
        const ny = uz * vx - ux * vz
        const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
        if (len < 1e-8) continue
        const map = (v: number[]) => {
          const rot = -Math.PI / 2
          const cs = Math.cos(rot)
          const sn = Math.sin(rot)
          return [v[0] * cs + v[2] * sn + 40, v[1], -v[0] * sn + v[2] * cs + 232]
        }
        tris.push({ a: map(a), b: map(b), c: map(c), ny: ny / len })
      }
    }
  }
  return (x: number, z: number) => {
    let best = -Infinity
    for (const tri of tris) {
      if (tri.ny < 0.45) continue
      const { a, b, c } = tri
      const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
      if (Math.abs(den) < 1e-8) continue
      const w1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den
      const w2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den
      const w0 = 1 - w1 - w2
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue
      const y = w0 * a[1] + w1 * b[1] + w2 * c[1]
      if (y > best) best = y
    }
    return Number.isFinite(best) ? best : null
  }
}
