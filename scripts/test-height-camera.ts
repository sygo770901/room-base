import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  OTS_CHEST_Y,
  OTS_DIST,
  OTS_ENTRY_PHI,
  OTS_LOOK_Y,
  OTS_RIGHT,
  fitOtsCamera,
  otsCamera,
  otsThetaFromFacing,
} from '../shared/camera.ts'
import { groundY, heightCameraBlocked } from '../shared/heightfield.ts'
import { heightFieldOf } from '../shared/heightmaps.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

type Tri = [number, number, number, number, number, number, number, number, number]

function readAccessor(
  json: { accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[]; bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[] },
  bin: Buffer,
  index: number,
) {
  const acc = json.accessors[index]
  if (acc.bufferView == null) throw new Error(`accessor ${index} 沒有 bufferView`)
  const view = json.bufferViews[acc.bufferView]
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const comps = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC3' ? 3 : 4
  const width = acc.componentType === 5126 ? 4 : acc.componentType === 5123 ? 2 : acc.componentType === 5125 ? 4 : 1
  const stride = view.byteStride ?? width * comps
  const out: number[] = []
  for (let i = 0; i < acc.count; i++) {
    const o = start + i * stride
    for (let c = 0; c < comps; c++) {
      const p = o + c * width
      if (acc.componentType === 5126) out.push(bin.readFloatLE(p))
      else if (acc.componentType === 5123) out.push(bin.readUInt16LE(p))
      else if (acc.componentType === 5125) out.push(bin.readUInt32LE(p))
      else out.push(bin.readUInt8(p))
    }
  }
  return { data: out, count: acc.count }
}

const tris: Tri[] = []
const grid = new Map<string, number[]>()
const CELL = 2

function addModel(file: string, x: number, y: number, z: number, rotY: number) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const bin = readFileSync(file.replace(/\.gltf$/, '.bin'))
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  for (const mesh of raw.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.POSITION == null || prim.indices == null) continue
      const pos = readAccessor(raw, bin, prim.attributes.POSITION)
      const idx = readAccessor(raw, bin, prim.indices)
      for (let i = 0; i + 2 < idx.count; i += 3) {
        const vert = (k: number) => {
          const lx = pos.data[idx.data[k] * 3]
          const ly = pos.data[idx.data[k] * 3 + 1]
          const lz = pos.data[idx.data[k] * 3 + 2]
          return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c] as const
        }
        const a = vert(i)
        const b = vert(i + 1)
        const d = vert(i + 2)
        const tri: Tri = [a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]]
        const id = tris.length
        tris.push(tri)
        const minX = Math.floor(Math.min(a[0], b[0], d[0]) / CELL)
        const maxX = Math.floor(Math.max(a[0], b[0], d[0]) / CELL)
        const minY = Math.floor(Math.min(a[1], b[1], d[1]) / CELL)
        const maxY = Math.floor(Math.max(a[1], b[1], d[1]) / CELL)
        const minZ = Math.floor(Math.min(a[2], b[2], d[2]) / CELL)
        const maxZ = Math.floor(Math.max(a[2], b[2], d[2]) / CELL)
        for (let gx = minX; gx <= maxX; gx++) {
          for (let gy = minY; gy <= maxY; gy++) {
            for (let gz = minZ; gz <= maxZ; gz++) {
              const key = `${gx},${gy},${gz}`
              const list = grid.get(key)
              if (list) list.push(id)
              else grid.set(key, [id])
            }
          }
        }
      }
    }
  }
}

const root = resolve(import.meta.dirname, '..')
const places = JSON.parse(readFileSync(resolve(root, 'data/heightlab.places.json'), 'utf8')) as {
  parts: { model: string; x: number; y: number; z: number; rotY?: number }[]
}
for (const part of places.parts) {
  addModel(resolve(root, 'public/assets/kaykit/dungeon-1.1', part.model), part.x, part.y, part.z, part.rotY ?? 0)
}

function rayTri(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
  const steps = Math.max(1, Math.ceil(maxT / 0.75))
  let best = maxT
  const seen = new Set<number>()
  const consider = (id: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const tri = tris[id]
    const ax = tri[0]
    const ay = tri[1]
    const az = tri[2]
    const bx = tri[3]
    const by = tri[4]
    const bz = tri[5]
    const cx = tri[6]
    const cy = tri[7]
    const cz = tri[8]
    const e1x = bx - ax
    const e1y = by - ay
    const e1z = bz - az
    const e2x = cx - ax
    const e2y = cy - ay
    const e2z = cz - az
    const px = dy * e2z - dz * e2y
    const py = dz * e2x - dx * e2z
    const pz = dx * e2y - dy * e2x
    const det = e1x * px + e1y * py + e1z * pz
    if (Math.abs(det) < 1e-8) return
    const inv = 1 / det
    const sx = ox - ax
    const sy = oy - ay
    const sz = oz - az
    const u = (sx * px + sy * py + sz * pz) * inv
    if (u < 0 || u > 1) return
    const qx = sy * e1z - sz * e1y
    const qy = sz * e1x - sx * e1z
    const qz = sx * e1y - sy * e1x
    const v = (dx * qx + dy * qy + dz * qz) * inv
    if (v < 0 || u + v > 1) return
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv
    if (tt > 0.04 && tt < best) best = tt
  }
  for (let i = 0; i <= steps; i++) {
    const t = (maxT * i) / steps
    const gx = Math.floor((ox + dx * t) / CELL)
    const gy = Math.floor((oy + dy * t) / CELL)
    const gz = Math.floor((oz + dz * t) / CELL)
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        for (let iz = gz - 1; iz <= gz + 1; iz++) {
          const ids = grid.get(`${ix},${iy},${iz}`)
          if (!ids) continue
          for (const id of ids) consider(id)
        }
      }
    }
  }
  return best
}

function meshBlocked(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 0.05) return false
  const hit = rayTri(x0, y0, z0, dx / dist, dy / dist, dz / dist, dist - 0.02)
  return hit < dist - 0.02
}

const field = heightFieldOf('heightlab')
assert(field != null, 'heightlab 要有高度圖')
if (!field) throw new Error('heightlab')

function blocked(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return heightCameraBlocked(field!, x0, y0, z0, x1, y1, z1) || meshBlocked(x0, y0, z0, x1, y1, z1)
}

function lineClear(x: number, chestY: number, z: number, camX: number, camY: number, camZ: number) {
  return !heightCameraBlocked(field!, x, chestY, z, camX, camY, camZ) && !meshBlocked(x, chestY, z, camX, camY, camZ)
}

const theta = otsThetaFromFacing(0)

function place(x: number, z: number) {
  const feet = groundY(field!, x, z)
  assert(feet != null, `路線離開地面 ${x},${z}`)
  const lookY = (feet as number) + OTS_LOOK_Y
  const chestY = (feet as number) + OTS_CHEST_Y
  const hipY = (feet as number) + 0.55
  const fitted = fitOtsCamera({
    x,
    y: lookY,
    z,
    chestY,
    bodyY: [chestY, hipY],
    theta,
    phi: OTS_ENTRY_PHI,
    radius: OTS_DIST,
    blocked,
  })
  assert(
    lineClear(x, chestY, z, fitted.pose.x, fitted.pose.y, fitted.pose.z),
    `胸口到鏡頭被擋住 x=${x.toFixed(2)} z=${z.toFixed(2)} feet=${(feet as number).toFixed(2)} r=${fitted.radius.toFixed(2)} sh=${fitted.shoulder.toFixed(2)} cam=(${fitted.pose.x.toFixed(2)},${fitted.pose.y.toFixed(2)},${fitted.pose.z.toFixed(2)})`,
  )
  assert(
    lineClear(x, hipY, z, fitted.pose.x, fitted.pose.y, fitted.pose.z),
    `髖部到鏡頭被擋住 x=${x.toFixed(2)} z=${z.toFixed(2)} r=${fitted.radius.toFixed(2)}`,
  )
  assert(fitted.pose.y > (feet as number) + 0.8, `鏡頭應高過腳 ${fitted.pose.y.toFixed(2)} feet=${feet}`)
  return { feet: feet as number, chestY, lookY, fitted }
}

function walk(x: number, z0: number, z1: number, step = 0.25) {
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step))
  const out = []
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n
    out.push(place(x, z))
  }
  return out
}

// 出生點後方的牆，沒拉近時鏡頭會埋進去。
{
  const feet = groundY(field, 14, 6.2) as number
  const raw = otsCamera(14, feet + OTS_LOOK_Y, 6.2, theta, OTS_ENTRY_PHI, OTS_DIST)
  assert(
    !lineClear(14, feet + OTS_CHEST_Y, 6.2, raw.x, raw.y, raw.z),
    '出生點全距離鏡頭應該會卡進後牆，測試才有對到這次的問題',
  )
}

// 樓梯靠牆的那一側，全距離時右肩鏡頭會穿進側牆或樓梯。
{
  let caught = false
  for (let z = 14.2; z <= 18; z += 0.4) {
    const feet = groundY(field, 11.4, z)
    if (feet == null) continue
    const raw = otsCamera(11.4, feet + OTS_LOOK_Y, z, theta, OTS_ENTRY_PHI, OTS_DIST)
    if (!lineClear(11.4, feet + OTS_CHEST_Y, z, raw.x, raw.y, raw.z)) {
      caught = true
      break
    }
  }
  assert(caught, '樓梯靠牆時全距離鏡頭應該會被側牆或樓梯擋住')
}

const stairs = walk(14, 6.4, 25.2)
const midStair = place(14, 16)
assert(midStair.fitted.radius > 3.5 && midStair.fitted.shoulder > 1.5, `樓梯中央應維持越肩 r=${midStair.fitted.radius.toFixed(2)} sh=${midStair.fitted.shoulder.toFixed(2)}`)
const fallen = walk(14, 25.2, 28)
walk(12.2, 14, 21)
walk(15.6, 14, 21)

const low = stairs[0]
const onPlatform = place(14, 20)
assert(onPlatform.fitted.pose.y > low.fitted.pose.y + 2.2, `鏡頭高度應跟著地面升，低 ${low.fitted.pose.y.toFixed(2)} 高台 ${onPlatform.fitted.pose.y.toFixed(2)}`)
assert(fallen[fallen.length - 1].feet < 0.3, '路線終點應已經摔到地面')
assert(fallen[fallen.length - 1].fitted.pose.y < onPlatform.fitted.pose.y - 2, '摔下去之後鏡頭要跟著降')

// 庭院空地維持越肩：人在左下，準心在前方。
const open = place(14, 10)
assert(open.fitted.radius > 4, `空地不該被拉得很近 r=${open.fitted.radius.toFixed(2)}`)
assert(open.fitted.shoulder > 1.6, `空地應維持右肩偏移 sh=${open.fitted.shoulder.toFixed(2)}`)
const cam = new THREE.PerspectiveCamera(58, 1280 / 720, 0.05, 180)
cam.position.set(open.fitted.pose.x, open.fitted.pose.y, open.fitted.pose.z)
cam.up.set(0, 1, 0)
cam.lookAt(open.fitted.pose.aimX, open.fitted.pose.aimY, open.fitted.pose.aimZ)
cam.updateMatrixWorld(true)
const chest = new THREE.Vector3(14, open.chestY, 10).project(cam)
const aim = new THREE.Vector3(open.fitted.pose.aimX, open.fitted.pose.aimY, open.fitted.pose.aimZ).project(cam)
assert(chest.x < -0.15 && chest.y < -0.25, `空地角色應在左下 ndc=(${chest.x.toFixed(2)},${chest.y.toFixed(2)})`)
assert(Math.abs(aim.x) < 0.04 && Math.abs(aim.y) < 0.04, `準心應在畫面正中 (${aim.x.toFixed(3)},${aim.y.toFixed(3)})`)
assert(OTS_RIGHT >= 1.4, '右肩偏移太小')

console.log(
  'height-camera: ok',
  `open r=${open.fitted.radius.toFixed(2)} sh=${open.fitted.shoulder.toFixed(2)}`,
  `platform camY=${onPlatform.fitted.pose.y.toFixed(2)}`,
  `fall camY=${fallen[fallen.length - 1].fitted.pose.y.toFixed(2)}`,
)
