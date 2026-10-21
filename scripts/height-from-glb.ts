/**
 * 從 GLB（或由 KayKit 零件擺出來的 GLB）掃地面高度。
 *
 *   npx tsx scripts/height-from-glb.ts
 *   npx tsx scripts/height-from-glb.ts --glb some.glb --override data/heightlab.override.json --out data/out.json --cell 1 --origin 0,0 --cols 28 --rows 34
 *
 * --places 會先把零件烘成一支 GLB，再從那支 GLB 掃，不直接掃 gltf。
 * override 在掃描之後蓋上去：walls / heights / stairs。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { applyHeightOverride, groundY, type HeightField, type HeightOverride, type StairCell } from '../shared/heightfield.ts'

const ROOT = resolve(import.meta.dirname, '..')
const KIT = resolve(ROOT, 'public/assets/kaykit/dungeon-1.1')

type Vec3 = [number, number, number]
type Tri = { a: Vec3; b: Vec3; c: Vec3; ny: number; area: number }

type Part = { model: string; x: number; y: number; z: number; rotY?: number; scale?: number }

type PlacesFile = {
  cell: number
  originX: number
  originZ: number
  cols: number
  rows: number
  spawns?: { x: number; z: number; y?: number }[]
  patrol?: { x: number; z: number }[]
  parts: Part[]
}

function arg(name: string) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function readAccessor(json: { accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[]; bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[] }, bin: Buffer, index: number) {
  const acc = json.accessors[index]
  if (acc.bufferView == null) throw new Error(`accessor ${index} 沒有 bufferView`)
  const view = json.bufferViews[acc.bufferView]
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const comps = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC3' ? 3 : 4
  const width = acc.componentType === 5126 ? 4 : acc.componentType === 5123 ? 2 : acc.componentType === 5125 ? 4 : acc.componentType === 5121 ? 1 : 0
  if (!width) throw new Error(`不支援的 componentType ${acc.componentType}`)
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
  return { data: out, count: acc.count, comps }
}

function bufferOf(json: { buffers?: { uri?: string }[] }, bin: Buffer | null, baseDir: string) {
  if (bin) return bin
  const uri = json.buffers?.[0]?.uri
  if (!uri || uri.startsWith('data:')) throw new Error('只支援外部 bin 或 GLB 內嵌緩衝')
  return readFileSync(resolve(baseDir, uri))
}

function readGlb(buf: Buffer) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB')
  let off = 12
  let json: { accessors: never[]; bufferViews: never[]; meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[] } | null = null
  let bin: Buffer | null = null
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    const chunk = buf.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
    else if (type === 0x004e4942) bin = Buffer.from(chunk)
    off += 8 + len
  }
  if (!json || !bin) throw new Error('GLB 缺少 JSON 或 BIN')
  return { json, bin }
}

function trianglesFrom(json: { meshes?: { primitives: { attributes: { POSITION?: number }; indices?: number }[] }[]; accessors: never[]; bufferViews: never[] }, bin: Buffer): Tri[] {
  const tris: Tri[] = []
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.POSITION == null || prim.indices == null) continue
      const pos = readAccessor(json, bin, prim.attributes.POSITION)
      const idx = readAccessor(json, bin, prim.indices)
      const vert = (i: number): Vec3 => [pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]]
      for (let i = 0; i + 2 < idx.count; i += 3) {
        const a = vert(idx.data[i])
        const b = vert(idx.data[i + 1])
        const c = vert(idx.data[i + 2])
        const ux = b[0] - a[0]
        const uy = b[1] - a[1]
        const uz = b[2] - a[2]
        const vx = c[0] - a[0]
        const vy = c[1] - a[1]
        const vz = c[2] - a[2]
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        const len = Math.hypot(nx, ny, nz)
        if (len < 1e-8) continue
        tris.push({ a, b, c, ny: ny / len, area: len * 0.5 })
      }
    }
  }
  return tris
}

function loadGltfTriangles(file: string): Tri[] {
  const abs = resolve(file)
  const buf = readFileSync(abs)
  if (abs.endsWith('.glb')) {
    const { json, bin } = readGlb(buf)
    return trianglesFrom(json as never, bin)
  }
  const json = JSON.parse(buf.toString('utf8'))
  const bin = bufferOf(json, null, dirname(abs))
  return trianglesFrom(json, bin)
}

function transform(v: Vec3, part: Part): Vec3 {
  const s = part.scale ?? 1
  const x = v[0] * s
  const y = v[1] * s
  const z = v[2] * s
  const rot = part.rotY ?? 0
  const c = Math.cos(rot)
  const si = Math.sin(rot)
  return [x * c + z * si + part.x, y + part.y, -x * si + z * c + part.z]
}

function composeGlb(parts: Part[], kitDir: string) {
  const positions: number[] = []
  const indices: number[] = []
  let base = 0
  for (const part of parts) {
    const file = resolve(kitDir, part.model)
    const tris = loadGltfTriangles(file)
    for (const tri of tris) {
      for (const v of [tri.a, tri.b, tri.c]) {
        const w = transform(v, part)
        positions.push(w[0], w[1], w[2])
      }
      indices.push(base, base + 1, base + 2)
      base += 3
    }
  }
  const posBuf = Buffer.alloc(positions.length * 4)
  let min: Vec3 = [Infinity, Infinity, Infinity]
  let max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    posBuf.writeFloatLE(positions[i], i * 4)
    const axis = i % 3
    if (positions[i] < min[axis]) min[axis] = positions[i]
    if (positions[i] > max[axis]) max[axis] = positions[i]
  }
  const idxBuf = Buffer.alloc(indices.length * 4)
  for (let i = 0; i < indices.length; i++) idxBuf.writeUInt32LE(indices[i], i * 4)
  const bin = Buffer.concat([posBuf, idxBuf])
  const json = {
    asset: { version: '2.0', generator: 'height-from-glb' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    meshes: [{ name: 'heightlab', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, name: 'heightlab' }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }
  const jsonBuf = Buffer.from(JSON.stringify(json))
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (bin.length % 4)) % 4
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)])
  const header = Buffer.alloc(12)
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)
  const jHead = Buffer.alloc(8)
  jHead.writeUInt32LE(jsonChunk.length, 0)
  jHead.writeUInt32LE(0x4e4f534a, 4)
  const bHead = Buffer.alloc(8)
  bHead.writeUInt32LE(binChunk.length, 0)
  bHead.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jHead, jsonChunk, bHead, binChunk])
}

function yOnTri(tri: Tri, x: number, z: number) {
  const { a, b, c } = tri
  const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
  if (Math.abs(den) < 1e-8) return null
  const w1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den
  const w2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den
  const w0 = 1 - w1 - w2
  if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) return null
  return w0 * a[1] + w1 * b[1] + w2 * c[1]
}

function raster(tris: Tri[], cols: number, rows: number, cell: number, originX: number, originZ: number) {
  const sub = 4
  const topY = new Float64Array(cols * rows * sub * sub).fill(-Infinity)
  const upArea = new Float64Array(cols * rows)
  const vertArea = new Float64Array(cols * rows)
  const vertMin = new Float64Array(cols * rows).fill(Infinity)
  const vertMax = new Float64Array(cols * rows).fill(-Infinity)
  const step = Math.min(0.2, cell / sub)
  for (const tri of tris) {
    const minX = Math.min(tri.a[0], tri.b[0], tri.c[0])
    const maxX = Math.max(tri.a[0], tri.b[0], tri.c[0])
    const minZ = Math.min(tri.a[2], tri.b[2], tri.c[2])
    const maxZ = Math.max(tri.a[2], tri.b[2], tri.c[2])
    const c0 = Math.max(0, Math.floor((minX - originX) / cell))
    const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cell))
    const r0 = Math.max(0, Math.floor((minZ - originZ) / cell))
    const r1 = Math.min(rows - 1, Math.floor((maxZ - originZ) / cell))
    const nCells = Math.max(1, (c1 - c0 + 1) * (r1 - r0 + 1))
    if (tri.ny > 0.45) {
      for (let x = minX; x <= maxX; x += step) {
        for (let z = minZ; z <= maxZ; z += step) {
          const y = yOnTri(tri, x, z)
          if (y == null) continue
          const fx = (x - originX) / cell
          const fz = (z - originZ) / cell
          const cx = Math.floor(fx)
          const cz = Math.floor(fz)
          if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) continue
          const sx = Math.min(sub - 1, Math.max(0, Math.floor((fx - cx) * sub)))
          const sz = Math.min(sub - 1, Math.max(0, Math.floor((fz - cz) * sub)))
          const si = (cz * cols + cx) * sub * sub + sz * sub + sx
          if (y > topY[si]) topY[si] = y
        }
      }
      for (let cz = r0; cz <= r1; cz++) {
        for (let cx = c0; cx <= c1; cx++) upArea[cz * cols + cx] += (tri.area * tri.ny) / nCells
      }
    } else {
      const y0 = Math.min(tri.a[1], tri.b[1], tri.c[1])
      const y1 = Math.max(tri.a[1], tri.b[1], tri.c[1])
      for (let cz = r0; cz <= r1; cz++) {
        for (let cx = c0; cx <= c1; cx++) {
          const i = cz * cols + cx
          vertArea[i] += (tri.area * (1 - Math.abs(tri.ny))) / nCells
          if (y0 < vertMin[i]) vertMin[i] = y0
          if (y1 > vertMax[i]) vertMax[i] = y1
        }
      }
    }
  }
  const samples: { x: number; y: number; z: number }[][] = Array.from({ length: cols * rows }, () => [])
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const bucket = samples[cz * cols + cx]
      for (let sz = 0; sz < sub; sz++) {
        for (let sx = 0; sx < sub; sx++) {
          const y = topY[(cz * cols + cx) * sub * sub + sz * sub + sx]
          if (y === -Infinity) continue
          bucket.push({
            x: originX + (cx + (sx + 0.5) / sub) * cell,
            y,
            z: originZ + (cz + (sz + 0.5) / sub) * cell,
          })
        }
      }
    }
  }
  return { samples, upArea, vertArea, vertMin, vertMax }
}

function classify(
  cols: number,
  rows: number,
  samples: { x: number; y: number; z: number }[][],
  upArea: Float64Array,
  vertArea: Float64Array,
  vertMin: Float64Array,
  vertMax: Float64Array,
): { cells: (number | null)[]; stairs: StairCell[] } {
  const cells: (number | null)[] = Array(cols * rows).fill(null)
  const stairs: StairCell[] = []
  for (let i = 0; i < cols * rows; i++) {
    const pts = samples[i]
    if (pts.length < 6) continue
    const ys = pts.map((p) => p.y).sort((a, b) => a - b)
    let bestI = 0
    let bestN = 0
    for (let a = 0; a < ys.length; a++) {
      let b = a
      while (b < ys.length && ys[b] <= ys[a] + 0.55) b++
      if (b - a > bestN) {
        bestN = b - a
        bestI = a
      }
    }
    if (bestN < 6) continue
    const lowB = ys[bestI]
    const band = pts.filter((p) => p.y >= lowB - 0.02 && p.y <= lowB + 0.55)
    let yMin = Infinity
    let yMax = -Infinity
    let sx = 0
    let sy = 0
    let sz = 0
    for (const p of band) {
      if (p.y < yMin) yMin = p.y
      if (p.y > yMax) yMax = p.y
      sx += p.x
      sy += p.y
      sz += p.z
    }
    const n = band.length
    const mx = sx / n
    const my = sy / n
    const mz = sz / n
    const cx = i % cols
    const cz = Math.floor(i / cols)
    // 牆身從地面拉到牆頂，頂面又平：那是牆帽，不能站。
    const tallWall = vertMax[i] - vertMin[i] > 2.2 && Math.abs(my - vertMax[i]) < 0.5 && yMax - yMin < 0.35
    if (tallWall) continue
    if (vertArea[i] > upArea[i] * 2.2 && yMax - yMin < 0.35 && my > 1.2) continue
    if (yMax - yMin >= 0.28) {
      let covX = 0
      let covZ = 0
      for (const p of band) {
        covX += (p.x - mx) * (p.y - my)
        covZ += (p.z - mz) * (p.y - my)
      }
      const alongZ = Math.abs(covZ) >= Math.abs(covX)
      const zs = band.map((p) => (alongZ ? p.z : p.x)).sort((a, b) => a - b)
      const loCut = zs[Math.floor(zs.length * 0.2)] ?? zs[0]
      const hiCut = zs[Math.floor(zs.length * 0.8)] ?? zs[zs.length - 1]
      const lowPts = band.filter((p) => (alongZ ? p.z : p.x) <= loCut + 1e-6)
      const highPts = band.filter((p) => (alongZ ? p.z : p.x) >= hiCut - 1e-6)
      const avg = (list: typeof band) => list.reduce((s, p) => s + p.y, 0) / Math.max(1, list.length)
      let low = avg(lowPts.length ? lowPts : band)
      let high = avg(highPts.length ? highPts : band)
      let dir: StairCell['dir']
      if (alongZ) dir = high >= low ? '+z' : '-z'
      else dir = high >= low ? '+x' : '-x'
      if (high < low) {
        const swap = low
        low = high
        high = swap
      }
      if (high - low < 0.2) {
        cells[i] = my
        continue
      }
      cells[i] = (low + high) / 2
      stairs.push({ x: cx, z: cz, dir, low, high })
      continue
    }
    const mid = ys[Math.floor(ys.length / 2)]
    cells[i] = band.map((p) => p.y).sort((a, b) => a - b)[Math.floor(band.length / 2)] ?? mid
  }
  return { cells, stairs }
}

function toRows(cells: (number | null)[], cols: number, rows: number) {
  const out: (number | null)[][] = []
  for (let z = 0; z < rows; z++) {
    const row: (number | null)[] = []
    for (let x = 0; x < cols; x++) {
      const v = cells[z * cols + x]
      row.push(v == null ? null : Math.round(v * 1000) / 1000)
    }
    out.push(row)
  }
  return out
}

function roundStairs(stairs: StairCell[]): StairCell[] {
  return stairs.map((s) => ({
    ...s,
    low: Math.round(s.low * 1000) / 1000,
    high: Math.round(s.high * 1000) / 1000,
  }))
}

function ascii(field: HeightField) {
  const lines: string[] = []
  for (let z = 0; z < field.rows; z++) {
    let line = ''
    for (let x = 0; x < field.cols; x++) {
      const stair = field.stairs.find((s) => s.x === x && s.z === z)
      const v = field.cells[z * field.cols + x]
      if (stair) line += stair.dir === '+z' || stair.dir === '-z' ? '/' : '>'
      else if (v == null) line += '#'
      else if (v < 0.3) line += '.'
      else line += Math.min(9, Math.round(v)).toString()
    }
    lines.push(line)
  }
  return lines.join('\n')
}

function main() {
  const placesPath = arg('--places') ?? resolve(ROOT, 'data/heightlab.places.json')
  const overridePath = arg('--override') ?? resolve(ROOT, 'data/heightlab.override.json')
  const glbPath = arg('--glb') ?? resolve(ROOT, 'public/maps/heightlab.glb')
  const outPath = arg('--out') ?? resolve(ROOT, 'data/heightlab.json')
  const id = arg('--id') ?? 'heightlab'
  const places = arg('--places') || !arg('--glb') ? (JSON.parse(readFileSync(placesPath, 'utf8')) as PlacesFile) : null

  let tris: Tri[]
  let cell = Number(arg('--cell') ?? places?.cell ?? 1)
  let originX = 0
  let originZ = 0
  let cols = Number(arg('--cols') ?? places?.cols ?? 0)
  let rows = Number(arg('--rows') ?? places?.rows ?? 0)
  if (arg('--origin')) {
    const [ox, oz] = arg('--origin')!.split(',').map(Number)
    originX = ox
    originZ = oz
  } else if (places) {
    originX = places.originX
    originZ = places.originZ
  }

  if (places) {
    const glb = composeGlb(places.parts, KIT)
    mkdirSync(dirname(glbPath), { recursive: true })
    writeFileSync(glbPath, glb)
    const back = readGlb(glb)
    tris = trianglesFrom(back.json as never, back.bin)
    console.log(`glb ${glbPath} ${glb.length} bytes, tris ${tris.length}`)
  } else {
    tris = loadGltfTriangles(glbPath)
    console.log(`read ${glbPath} tris ${tris.length}`)
  }
  if (!cols || !rows) throw new Error('需要 --cols 與 --rows')

  const { samples, upArea, vertArea, vertMin, vertMax } = raster(tris, cols, rows, cell, originX, originZ)
  const baked = classify(cols, rows, samples, upArea, vertArea, vertMin, vertMax)
  let field: HeightField = {
    id,
    cell,
    originX,
    originZ,
    cols,
    rows,
    cells: baked.cells,
    stairs: baked.stairs,
    spawns: places?.spawns ?? [],
    patrol: places?.patrol ?? [],
  }
  const ov = JSON.parse(readFileSync(overridePath, 'utf8')) as HeightOverride
  field = applyHeightOverride(field, ov)

  for (const s of field.spawns) {
    if (groundY(field, s.x, s.z) == null) {
      console.warn(`出生點 (${s.x}, ${s.z}) 不在可走格上`)
    }
  }
  const walkable = field.cells.filter((c) => c != null).length
  const high = field.cells.filter((c) => c != null && c > 2).length
  console.log(`walkable ${walkable} stairs ${field.stairs.length} high ${high}`)
  console.log(ascii(field))
  if (!field.stairs.length) throw new Error('沒掃到樓梯')
  if (!high) throw new Error('沒掃到抬高的平台')

  const doc = {
    id: field.id,
    cell: field.cell,
    originX: field.originX,
    originZ: field.originZ,
    cols: field.cols,
    rows: field.rows,
    rowsCells: toRows(field.cells, field.cols, field.rows),
    stairs: roundStairs(field.stairs),
    spawns: field.spawns,
    patrol: field.patrol,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(doc))
  console.log(`wrote ${outPath}`)
}

main()
