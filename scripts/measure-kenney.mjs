import { readFileSync, readdirSync } from 'node:fs'

const dir = 'scripts/kenney-src/Models/GLB format'

function glbJson(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix
  const t = node.translation ?? [0, 0, 0]
  const r = node.rotation ?? [0, 0, 0, 1]
  const s = node.scale ?? [1, 1, 1]
  const [x, y, z, w] = r
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

for (const name of readdirSync(dir).filter((n) => n.endsWith('.glb') && n.startsWith('template'))) {
  const json = glbJson(`${dir}/${name}`)
  const mins = [Infinity, Infinity, Infinity]
  const maxs = [-Infinity, -Infinity, -Infinity]
  let tris = 0
  const nodes = json.nodes ?? []
  for (const node of nodes) {
    if (node.mesh == null) continue
    const mesh = json.meshes[node.mesh]
    const matrix = nodeMatrix(node)
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION]
      if (acc.min && acc.max) {
        for (const corner of [
          [acc.min[0], acc.min[1], acc.min[2]],
          [acc.max[0], acc.min[1], acc.min[2]],
          [acc.min[0], acc.max[1], acc.min[2]],
          [acc.max[0], acc.max[1], acc.min[2]],
          [acc.min[0], acc.min[1], acc.max[2]],
          [acc.max[0], acc.min[1], acc.max[2]],
          [acc.min[0], acc.max[1], acc.max[2]],
          [acc.max[0], acc.max[1], acc.max[2]],
        ]) {
          const p = transformPoint(matrix, corner)
          for (let i = 0; i < 3; i++) {
            mins[i] = Math.min(mins[i], p[i])
            maxs[i] = Math.max(maxs[i], p[i])
          }
        }
      }
      if (prim.indices != null) tris += json.accessors[prim.indices].count / 3
      else tris += acc.count / 3
    }
  }
  const size = mins.map((v, i) => maxs[i] - v)
  console.log(
    name.padEnd(30),
    'size',
    size.map((v) => v.toFixed(2)).join(' '),
    'min',
    mins.map((v) => v.toFixed(2)).join(' '),
    'tris',
    tris,
  )
}
