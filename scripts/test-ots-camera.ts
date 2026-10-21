import {
  OTS_AIM_AHEAD,
  OTS_DIST,
  OTS_ENTRY_PHI,
  OTS_LOOK_Y,
  OTS_RIGHT,
  otsCamera,
  otsThetaFromFacing,
} from '../shared/camera.ts'

function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}
function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
function len(a: { x: number; y: number; z: number }) {
  return Math.hypot(a.x, a.y, a.z)
}
function norm(a: { x: number; y: number; z: number }) {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

const anchor = { x: 74, y: OTS_LOOK_Y, z: 22 }
const pose = otsCamera(anchor.x, anchor.y, anchor.z, otsThetaFromFacing(0), OTS_ENTRY_PHI, OTS_DIST)
const cam = { x: pose.x, y: pose.y, z: pose.z }
const aim = { x: pose.aimX, y: pose.aimY, z: pose.aimZ }
const forward = norm(sub(aim, cam))
const right = norm(cross({ x: 0, y: 1, z: 0 }, forward))
const up = norm(cross(forward, right))

function viewOf(p: { x: number; y: number; z: number }) {
  const v = sub(p, cam)
  return { x: dot(v, right), y: dot(v, up), z: dot(v, forward) }
}
function distToRay(p: { x: number; y: number; z: number }) {
  const v = sub(p, cam)
  const along = dot(v, forward)
  const closest = { x: cam.x + forward.x * along, y: cam.y + forward.y * along, z: cam.z + forward.z * along }
  return len(sub(p, closest))
}

const chest = viewOf({ x: anchor.x, y: 1.05, z: anchor.z })
if (!(chest.x < -0.75)) throw new Error(`角色應在畫面左側，viewX=${chest.x.toFixed(2)}`)
if (!(chest.x > -2.3)) throw new Error(`角色不該被推出畫面，viewX=${chest.x.toFixed(2)}`)
if (!(chest.y < -0.28)) throw new Error(`角色應在畫面下方，viewY=${chest.y.toFixed(2)}`)
if (!(chest.z > 0.5)) throw new Error(`角色應在鏡頭前方，viewZ=${chest.z.toFixed(2)}`)

for (const y of [0.35, 0.9, 1.35, 1.9]) {
  const d = distToRay({ x: anchor.x, y, z: anchor.z })
  if (d < 0.55) throw new Error(`準心射線擦到身體 y=${y} dist=${d.toFixed(2)}`)
}
for (const xoff of [-0.34, 0.34]) {
  const d = distToRay({ x: anchor.x + xoff, y: 1.25, z: anchor.z + 0.15 })
  if (d < 0.2) throw new Error(`準心射線擦到肩膀 x=${xoff} dist=${d.toFixed(2)}`)
}

if (Math.hypot(pose.aimX - anchor.x, pose.aimZ - anchor.z) < OTS_AIM_AHEAD * 0.9) {
  throw new Error('注視點應在角色前方')
}
if (OTS_RIGHT < 1.4) throw new Error('右肩偏移太小，角色會擋準心')

console.log(
  'ots-camera: ok',
  `chest=(${chest.x.toFixed(2)},${chest.y.toFixed(2)})`,
  `ray=${distToRay({ x: anchor.x, y: 1.05, z: anchor.z }).toFixed(2)}`,
)
