import * as THREE from 'three'
import {
  OTS_AIM_AHEAD,
  OTS_DIST,
  OTS_ENTRY_PHI,
  OTS_LOOK_Y,
  OTS_RIGHT,
  otsCamera,
  otsThetaFromFacing,
} from '../shared/camera.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const anchor = { x: 74, y: OTS_LOOK_Y, z: 22 }
const pose = otsCamera(anchor.x, anchor.y, anchor.z, otsThetaFromFacing(0), OTS_ENTRY_PHI, OTS_DIST)
const cam = new THREE.PerspectiveCamera(58, 1280 / 720, 0.05, 180)
cam.position.set(pose.x, pose.y, pose.z)
cam.up.set(0, 1, 0)
cam.lookAt(pose.aimX, pose.aimY, pose.aimZ)
cam.updateMatrixWorld(true)

function ndc(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).project(cam)
}

function distToRay(x: number, y: number, z: number) {
  const dir = new THREE.Vector3()
  cam.getWorldDirection(dir)
  const v = new THREE.Vector3(x, y, z).sub(cam.position)
  const along = v.dot(dir)
  const closest = cam.position.clone().add(dir.multiplyScalar(along))
  return closest.distanceTo(new THREE.Vector3(x, y, z))
}

const chest = ndc(anchor.x, 1.05, anchor.z)
assert(chest.x < -0.18, `角色應在畫面左側，ndcX=${chest.x.toFixed(3)}`)
assert(chest.x > -0.7, `角色不該被推出畫面左側，ndcX=${chest.x.toFixed(3)}`)
assert(chest.y < -0.4, `角色應在畫面下方，ndcY=${chest.y.toFixed(3)}`)
assert(chest.y > -0.8, `角色胸口不該貼出畫面下方，ndcY=${chest.y.toFixed(3)}`)

const feet = ndc(anchor.x, 0.02, anchor.z)
assert(feet.y < -0.75 && feet.y > -0.99, `腳應在畫面下方內，ndcY=${feet.y.toFixed(3)}`)
const head = ndc(anchor.x, 1.7, anchor.z)
assert(head.y < -0.15, `頭也應在畫面中線以下，ndcY=${head.y.toFixed(3)}`)

// 面向 +Z 時左肩在 +X。看背的時候，左肩要比胸口更靠畫面左側，而且整段肩膀留在畫面裡。
const leftShoulder = ndc(anchor.x + 0.34, 1.35, anchor.z)
const rightShoulder = ndc(anchor.x - 0.34, 1.35, anchor.z)
assert(leftShoulder.x < chest.x - 0.04, `左肩應露在胸口外側，ndcX=${leftShoulder.x.toFixed(3)}`)
assert(rightShoulder.x > leftShoulder.x, '右肩應在左肩的畫面右側')
for (const [name, p] of [
  ['左肩', leftShoulder],
  ['右肩', rightShoulder],
] as const) {
  assert(Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.92, `${name}應留在畫面內 (${p.x.toFixed(2)},${p.y.toFixed(2)})`)
}

const aim = ndc(pose.aimX, pose.aimY, pose.aimZ)
assert(Math.abs(aim.x) < 0.02 && Math.abs(aim.y) < 0.02, `準心應在畫面正中，得到 (${aim.x.toFixed(3)},${aim.y.toFixed(3)})`)

assert(pose.z < anchor.z - 1, '鏡頭應在角色背後')
const forward = new THREE.Vector3()
cam.getWorldDirection(forward)
assert(forward.z > 0.7, `鏡頭應順著角色面向看背，forward.z=${forward.z.toFixed(2)}`)

for (const y of [0.35, 0.9, 1.35, 1.9]) {
  const d = distToRay(anchor.x, y, anchor.z)
  assert(d >= 0.55, `準心射線擦到身體 y=${y} dist=${d.toFixed(2)}`)
}
for (const xoff of [-0.34, 0.34]) {
  const d = distToRay(anchor.x + xoff, 1.25, anchor.z + 0.15)
  assert(d >= 0.2, `準心射線擦到肩膀 x=${xoff} dist=${d.toFixed(2)}`)
}

assert(Math.hypot(pose.aimX - anchor.x, pose.aimZ - anchor.z) >= OTS_AIM_AHEAD * 0.9, '注視點應在角色前方')
assert(OTS_RIGHT >= 1.4, '右肩偏移太小，角色會擋準心')

console.log(
  'ots-camera: ok',
  `chest=(${chest.x.toFixed(2)},${chest.y.toFixed(2)})`,
  `leftShoulder=${leftShoulder.x.toFixed(2)}`,
  `ray=${distToRay(anchor.x, 1.05, anchor.z).toFixed(2)}`,
)
