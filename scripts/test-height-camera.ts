import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  OTS_CHEST_Y,
  OTS_DIST,
  OTS_ENTRY_PHI,
  OTS_HEIGHT_AIM,
  OTS_HEIGHT_AIM_DROP,
  OTS_HEIGHT_PHI,
  OTS_LOOK_Y,
  OTS_RIGHT,
  fitOtsCamera,
  heightCamRadius,
  heightWalkForward,
  otsCamera,
  otsThetaFromFacing,
} from '../shared/camera.ts'
import { groundY, heightCameraBlocked } from '../shared/heightfield.ts'
import { heightFieldOf } from '../shared/heightmaps.ts'
import { heightTerrainBlocked, heightWallBlocksPoint } from '../shared/heightlab.ts'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import type { Place } from '../shared/dungeon.ts'
import { meshSegmentBlocked, writeInstanceMatrices } from '../src/scene/occlusion.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

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

const rootDir = resolve(import.meta.dirname, '..')
const places = JSON.parse(readFileSync(resolve(rootDir, 'data/heightlab.places.json'), 'utf8')) as {
  parts: Place[]
}
const byModel = new Map<string, Place[]>()
for (const part of places.parts) {
  const list = byModel.get(part.model) ?? []
  list.push(part)
  byModel.set(part.model, list)
}

const dungeon = new THREE.Group()
dungeon.name = 'dungeon-occlusion'
for (const [model, list] of byModel) {
  const file = resolve(rootDir, 'public/assets/kaykit/dungeon-1.1', model)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const bin = readFileSync(file.replace(/\.gltf$/, '.bin'))
  for (const mesh of raw.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.POSITION == null || prim.indices == null) continue
      const pos = readAccessor(raw, bin, prim.attributes.POSITION)
      const idx = readAccessor(raw, bin, prim.indices)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.data), 3))
      geometry.setIndex(new THREE.BufferAttribute(idx.data.some((n) => n > 65535) ? new Uint32Array(idx.data) : new Uint16Array(idx.data), 1))
      const inst = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), list.length)
      writeInstanceMatrices(inst, list, new THREE.Matrix4())
      dungeon.add(inst)
    }
  }
}

const field = heightFieldOf('heightlab')
assert(field != null, 'heightlab 要有高度圖')
if (!field) throw new Error('heightlab')

function blocked(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return heightTerrainBlocked(field!, x0, y0, z0, x1, y1, z1) || meshSegmentBlocked(dungeon, x0, y0, z0, x1, y1, z1)
}

function lineClear(x: number, chestY: number, z: number, camX: number, camY: number, camZ: number) {
  return !heightCameraBlocked(field!, x, chestY, z, camX, camY, camZ) && !meshSegmentBlocked(dungeon, x, chestY, z, camX, camY, camZ)
}

const prevStorage = globalThis.localStorage
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
  clear() {},
  key: () => null,
  length: 0,
}
assert(heightCamRadius(2.5) === OTS_DIST, `沒存過鏡頭距離時高度圖應為 ${OTS_DIST}，實際 ${heightCamRadius(2.5)}`)
globalThis.localStorage = {
  getItem: () => '3.25',
  setItem() {},
  removeItem() {},
  clear() {},
  key: () => null,
  length: 1,
}
assert(Math.abs(heightCamRadius(3.25) - 3.25) < 1e-6, '玩家調過的距離要保留')
globalThis.localStorage = prevStorage

const theta = otsThetaFromFacing(0)
const cam = new THREE.PerspectiveCamera(58, 1280 / 720, 0.05, 180)

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
    phi: OTS_HEIGHT_PHI,
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
  const view = otsCamera(x, lookY, z, theta, OTS_HEIGHT_PHI, fitted.radius, fitted.shoulder, OTS_HEIGHT_AIM, OTS_HEIGHT_AIM_DROP)
  cam.position.set(view.x, view.y, view.z)
  cam.up.set(0, 1, 0)
  cam.lookAt(view.aimX, view.aimY, view.aimZ)
  cam.updateMatrixWorld(true)
  const ndc = new THREE.Vector3(x, chestY, z).project(cam)
  const aimN = new THREE.Vector3(view.aimX, view.aimY, view.aimZ).project(cam)
  assert(ndc.x < -0.12 && ndc.y < -0.2 && ndc.z < 1, `角色應在左下 x=${x.toFixed(2)} z=${z.toFixed(2)} ndc=(${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})`)
  assert(Math.abs(aimN.x) < 0.04 && Math.abs(aimN.y) < 0.04, `準心應在畫面正中 (${aimN.x.toFixed(3)},${aimN.y.toFixed(3)})`)
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

{
  const feet = groundY(field, 14, 6) as number
  const raw = otsCamera(14, feet + OTS_LOOK_Y, 6, theta, OTS_HEIGHT_PHI, OTS_DIST)
  assert(
    meshSegmentBlocked(dungeon, 14, feet + OTS_CHEST_Y, 6, raw.x, raw.y, raw.z),
    '出生點全距離鏡頭應該打到後牆模型。這條射線要跟畫面用的 Raycaster 相同',
  )
  assert(heightWallBlocksPoint(raw.x, raw.y, raw.z), `全距離鏡頭應在牆體裡 z=${raw.z.toFixed(2)}`)
  assert(
    heightTerrainBlocked(field, 14, feet + OTS_CHEST_Y, 6, raw.x, raw.y, raw.z),
    '網格還沒載入時，牆的範圍也要把出生點全距離鏡頭擋下來',
  )
}

{
  let caught = false
  for (let z = 14.2; z <= 18; z += 0.4) {
    const feet = groundY(field, 11.4, z)
    if (feet == null) continue
    const raw = otsCamera(11.4, feet + OTS_LOOK_Y, z, theta, OTS_HEIGHT_PHI, OTS_DIST)
    if (!lineClear(11.4, feet + OTS_CHEST_Y, z, raw.x, raw.y, raw.z)) {
      caught = true
      break
    }
  }
  assert(caught, '樓梯靠牆時全距離鏡頭應該會被側牆或樓梯擋住')
}

const stairs = walk(14, 6, 25.2)
const midStair = place(14, 16)
assert(midStair.fitted.radius > 3.5 && midStair.fitted.shoulder > 1.5, `樓梯中央應維持越肩 r=${midStair.fitted.radius.toFixed(2)} sh=${midStair.fitted.shoulder.toFixed(2)}`)
const fallen = walk(14, 25.2, 28)
walk(12.2, 14, 21)
walk(15.6, 14, 21)

// 摔出邊緣時人在空中，不是貼著 groundY。鏡頭不該縮進身體裡。
{
  const x = 14
  const z = 26.22
  const feet = 2.42
  const lookY = feet + OTS_LOOK_Y
  const chestY = feet + OTS_CHEST_Y
  const fitted = fitOtsCamera({
    x,
    y: lookY,
    z,
    chestY,
    bodyY: [chestY, feet + 0.55],
    theta,
    phi: OTS_HEIGHT_PHI,
    radius: OTS_DIST,
    blocked,
  })
  assert(fitted.radius > 1.4, `摔落時鏡頭縮進身體 r=${fitted.radius.toFixed(2)} sh=${fitted.shoulder.toFixed(2)}`)
  assert(lineClear(x, chestY, z, fitted.pose.x, fitted.pose.y, fitted.pose.z), '摔落時胸口到鏡頭被擋住')
  const view = otsCamera(x, lookY, z, theta, OTS_HEIGHT_PHI, fitted.radius, fitted.shoulder, OTS_HEIGHT_AIM, OTS_HEIGHT_AIM_DROP)
  cam.position.set(view.x, view.y, view.z)
  cam.up.set(0, 1, 0)
  cam.lookAt(view.aimX, view.aimY, view.aimZ)
  cam.updateMatrixWorld(true)
  const ndc = new THREE.Vector3(x, chestY, z).project(cam)
  assert(ndc.x < -0.12 && ndc.y < -0.15 && ndc.z < 1, `摔落時角色應在左下 ndc=(${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})`)
}

{
  const spawnView = place(14, 6)
  assert(
    spawnView.fitted.pose.z > 2.85,
    `出生鏡頭要站在後牆前面 z=${spawnView.fitted.pose.z.toFixed(2)} r=${spawnView.fitted.radius.toFixed(2)}`,
  )
  let x = 14
  let z = 6
  let yaw = 0
  const rig = new THREE.PerspectiveCamera(58, 1280 / 720, 0.05, 180)
  for (let step = 0; step < 120 && z < 28; step++) {
    const feetNow = groundY(field, x, z)
    if (feetNow == null) break
    const lookY = feetNow + OTS_LOOK_Y
    const chestY = feetNow + OTS_CHEST_Y
    const fitted = fitOtsCamera({
      x,
      y: lookY,
      z,
      chestY,
      bodyY: [chestY, feetNow + 0.55],
      theta,
      phi: OTS_HEIGHT_PHI,
      radius: OTS_DIST,
      blocked,
    })
    const view = otsCamera(x, lookY, z, theta, OTS_HEIGHT_PHI, fitted.radius, fitted.shoulder, OTS_HEIGHT_AIM, OTS_HEIGHT_AIM_DROP)
    rig.position.set(view.x, view.y, view.z)
    rig.up.set(0, 1, 0)
    rig.lookAt(view.aimX, view.aimY, view.aimZ)
    rig.updateMatrixWorld(true)
    const dir = new THREE.Vector3()
    rig.getWorldDirection(dir)
    const fwd = heightWalkForward(view.x, view.y, view.z, dir.x, dir.y, dir.z, x, lookY, z, OTS_HEIGHT_AIM_DROP)
    yaw = Math.atan2(fwd.x, fwd.z)
    const moved = resolvePlayerMove(x, z, fwd.x * 0.25, fwd.z * 0.25, [], undefined, [], feetNow, [], field)
    x = moved.x
    z = moved.z
  }
  assert(Math.abs(x - 14) < 0.2, `按住 W 不該橫漂 x=${x.toFixed(2)} z=${z.toFixed(2)} yaw=${yaw.toFixed(3)}`)
  assert(Math.abs(yaw) < 0.05, `按住 W 不該轉向 yaw=${yaw.toFixed(3)}`)
  assert(z > 26, `按住 W 應走過平台摔下去 z=${z.toFixed(2)}`)
}

{
  const x = 14
  const z = 29.7
  const feet = groundY(field, x, z)
  assert(feet != null, '終點牆前還有地面')
  const lookY = (feet as number) + OTS_LOOK_Y
  const chestY = (feet as number) + OTS_CHEST_Y
  const fitted = fitOtsCamera({
    x,
    y: lookY,
    z,
    chestY,
    bodyY: [chestY, (feet as number) + 0.55],
    theta,
    phi: OTS_HEIGHT_PHI,
    radius: OTS_DIST,
    blocked,
  })
  assert(fitted.radius > 2.5, `貼上終點牆時鏡頭縮進身體 r=${fitted.radius.toFixed(2)} camZ=${fitted.pose.z.toFixed(2)}`)
  assert(fitted.pose.z < z - 1.2, `貼牆時鏡頭應留在身後 camZ=${fitted.pose.z.toFixed(2)}`)
}

const low = stairs[0]
const onPlatform = place(14, 20)
assert(onPlatform.fitted.pose.y > low.fitted.pose.y + 2.2, `鏡頭高度應跟著地面升，低 ${low.fitted.pose.y.toFixed(2)} 高台 ${onPlatform.fitted.pose.y.toFixed(2)}`)
assert(fallen[fallen.length - 1].feet < 0.3, '路線終點應已經摔到地面')
assert(fallen[fallen.length - 1].fitted.pose.y < onPlatform.fitted.pose.y - 2, '摔下去之後鏡頭要跟著降')

const open = place(14, 10)
assert(open.fitted.radius > 4, `空地不該被拉得很近 r=${open.fitted.radius.toFixed(2)}`)
assert(open.fitted.shoulder > 1.6, `空地應維持右肩偏移 sh=${open.fitted.shoulder.toFixed(2)}`)
assert(OTS_RIGHT >= 1.4, '右肩偏移太小')

console.log(
  'height-camera: ok',
  `open r=${open.fitted.radius.toFixed(2)} sh=${open.fitted.shoulder.toFixed(2)}`,
  `platform camY=${onPlatform.fitted.pose.y.toFixed(2)}`,
  `fall camY=${fallen[fallen.length - 1].fitted.pose.y.toFixed(2)}`,
)
