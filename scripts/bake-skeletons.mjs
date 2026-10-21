import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

globalThis.self = globalThis

function parseGlb(buf) {
  const data = new Uint8Array(buf)
  let off = 12
  let json
  let bin
  while (off < data.length) {
    const len = new DataView(data.buffer, data.byteOffset + off, 8).getUint32(0, true)
    const typ = String.fromCharCode(...data.subarray(off + 4, off + 8))
    const chunk = data.subarray(off + 8, off + 8 + len)
    if (typ.startsWith('JSON')) json = JSON.parse(new TextDecoder().decode(chunk))
    if (typ.startsWith('BIN')) bin = chunk
    off += 8 + len
  }
  return { json, bin }
}

function packGlb(json, bin) {
  const jsonText = JSON.stringify(json)
  const jsonPad = (4 - (jsonText.length % 4)) % 4
  const jsonChunk = Buffer.concat([Buffer.from(jsonText), Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (bin.length % 4)) % 4
  const binChunk = Buffer.concat([Buffer.from(bin), Buffer.alloc(binPad, 0)])
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const out = Buffer.alloc(total)
  out.write('glTF', 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  let o = 12
  out.writeUInt32LE(jsonChunk.length, o)
  out.write('JSON', o + 4)
  jsonChunk.copy(out, o + 8)
  o += 8 + jsonChunk.length
  out.writeUInt32LE(binChunk.length, o)
  out.write('BIN\0', o + 4)
  binChunk.copy(out, o + 8)
  return out
}

function stripTextures(buf) {
  const { json, bin } = parseGlb(buf)
  let png = null
  const image = json.images?.[0]
  if (image?.bufferView != null) {
    const bv = json.bufferViews[image.bufferView]
    png = Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength))
  }
  for (const mat of json.materials || []) {
    if (mat.pbrMetallicRoughness) delete mat.pbrMetallicRoughness.baseColorTexture
    delete mat.normalTexture
    delete mat.occlusionTexture
    delete mat.emissiveTexture
  }
  delete json.textures
  delete json.images
  delete json.samplers
  const packed = packGlb(json, bin)
  return { packed, png }
}

function load(buf) {
  const loader = new GLTFLoader()
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Promise((resolve, reject) => loader.parse(ab, '', resolve, reject))
}

function bakeScene(root) {
  root.updateMatrixWorld(true)
  const geos = []
  root.traverse((obj) => {
    const mesh = obj
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const pos = src.getAttribute('position')
    const uv = src.getAttribute('uv')
    const index = src.getIndex()
    const outPos = []
    const outUv = []
    const v = new THREE.Vector3()
    const tmp = []
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v)
      v.applyMatrix4(mesh.matrixWorld)
      tmp.push(v.x, v.y, v.z)
      if (uv) outUv.push(uv.getX(i), uv.getY(i))
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(tmp, 3))
    if (outUv.length) geom.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2))
    if (index) geom.setIndex(Array.from(index.array))
    geom.computeVertexNormals()
    geos.push(geom)
  })
  return THREE.BufferGeometryUtils
    ? null
    : geos
}

async function pose(file, clipName, outName) {
  const raw = readFileSync(file)
  const { packed, png } = stripTextures(raw)
  const gltf = await load(packed)
  const clip = THREE.AnimationClip.findByName(gltf.animations, clipName)
  if (!clip) throw new Error(`missing ${clipName}`)
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const action = mixer.clipAction(clip)
  action.play()
  action.time = clip.duration > 0 ? Math.min(0.05, clip.duration) : 0
  mixer.update(0.016)
  gltf.scene.updateMatrixWorld(true)
  const parts = []
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const pos = src.getAttribute('position')
    const uv = src.getAttribute('uv')
    const index = src.getIndex()
    const tmp = []
    const uvs = []
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v)
      v.applyMatrix4(mesh.matrixWorld)
      tmp.push(v.x, v.y, v.z)
      if (uv) uvs.push(uv.getX(i), uv.getY(i))
    }
    const base = tmp.length / 3
    let indices
    if (index) indices = Array.from(index.array).map((n) => n)
    else indices = Array.from({ length: base }, (_, i) => i)
    parts.push({ tmp, uvs, indices, base })
  })
  let positions = []
  let uvs = []
  let indices = []
  let offset = 0
  for (const p of parts) {
    positions.push(...p.tmp)
    uvs.push(...p.uvs)
    indices.push(...p.indices.map((n) => n + offset))
    offset += p.base
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (uvs.length) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  geom.computeBoundingBox()
  const box = geom.boundingBox
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  const feet = box.min.y
  const posAttr = geom.getAttribute('position')
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setXYZ(i, posAttr.getX(i) - cx, posAttr.getY(i) - feet, posAttr.getZ(i) - cz)
  }
  posAttr.needsUpdate = true
  geom.computeBoundingBox()
  const b2 = geom.boundingBox
  console.log(outName, clipName, 'size', {
    x: +(b2.max.x - b2.min.x).toFixed(2),
    y: +(b2.max.y - b2.min.y).toFixed(2),
    z: +(b2.max.z - b2.min.z).toFixed(2),
    verts: posAttr.count,
  })
  const normal = geom.getAttribute('normal')
  const uv = geom.getAttribute('uv')
  const idx = geom.getIndex()
  const posBytes = Buffer.from(posAttr.array.buffer, posAttr.array.byteOffset, posAttr.array.byteLength)
  const nrmBytes = Buffer.from(normal.array.buffer, normal.array.byteOffset, normal.array.byteLength)
  const uvBytes = Buffer.from(uv.array.buffer, uv.array.byteOffset, uv.array.byteLength)
  const idxArr = idx.array instanceof Uint32Array ? Uint16Array.from(idx.array) : idx.array
  const idxBytes = Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength)
  const pngBytes = png
  const align = (n) => (n + 3) & ~3
  let cursor = 0
  const chunks = []
  function push(buf) {
    const start = cursor
    chunks.push(Buffer.from(buf))
    cursor += buf.length
    const pad = align(cursor) - cursor
    if (pad) {
      chunks.push(Buffer.alloc(pad))
      cursor += pad
    }
    return { start, length: buf.length }
  }
  const pView = push(posBytes)
  const nView = push(nrmBytes)
  const uView = push(uvBytes)
  const iView = push(idxBytes)
  const tView = push(pngBytes)
  const bin = Buffer.concat(chunks)
  const json = {
    asset: { version: '2.0', generator: 'sample-room-bake' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: outName }],
    materials: [
      {
        name: 'skeleton',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    images: [{ mimeType: 'image/png', bufferView: 4, name: 'skeleton_texture' }],
    samplers: [{ magFilter: 9729, minFilter: 9987 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: posAttr.count,
        type: 'VEC3',
        min: [b2.min.x, b2.min.y, b2.min.z],
        max: [b2.max.x, b2.max.y, b2.max.z],
      },
      { bufferView: 1, componentType: 5126, count: normal.count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uv.count, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: idxArr.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: pView.start, byteLength: pView.length, target: 34962 },
      { buffer: 0, byteOffset: nView.start, byteLength: nView.length, target: 34962 },
      { buffer: 0, byteOffset: uView.start, byteLength: uView.length, target: 34962 },
      { buffer: 0, byteOffset: iView.start, byteLength: iView.length, target: 34963 },
      { buffer: 0, byteOffset: tView.start, byteLength: tView.length },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  // recompute bounds after foot snap — b2 is already shifted because we mutated positions then computeBoundingBox
  const out = packGlb(json, bin)
  const dest = `/workspace/public/assets/kaykit/skeletons/${outName}.glb`
  writeFileSync(dest, out)
  console.log('wrote', dest, out.length)
}

await pose('/tmp/skels/Skeleton_Warrior.glb', 'Skeletons_Inactive_Floor_Pose', 'skeleton_fallen')
await pose('/tmp/skels/Skeleton_Warrior.glb', 'Skeleton_Inactive_Standing_Pose', 'skeleton_guard')
await pose('/tmp/skels/Skeleton_Minion.glb', 'Death_A_Pose', 'skeleton_minion')
