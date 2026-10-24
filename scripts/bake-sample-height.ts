/**
 * 從寶物房的地板、牆、樓梯烘出高度圖。
 * 樓梯外觀是踏面。可走高度是連續斜坡，8m 從 0 升到 4。扶手那兩排不寫成階梯。
 *
 *   npx tsx scripts/bake-sample-height.ts
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SAMPLE_PLACES, SAMPLE_SPAWNS } from '../shared/sampleRoom.ts'

const ROOT = resolve(import.meta.dirname, '..')
const ORIGIN_X = 14
const ORIGIN_Z = 212

const parts = SAMPLE_PLACES.filter(
  (p) =>
    (p.model.startsWith('floor_') || p.model.startsWith('wall') || p.model.startsWith('stairs')) &&
    p.model !== 'wall_doorway.gltf',
).map((p) => ({
  model: p.model,
  x: p.x,
  y: p.y,
  z: p.z,
  rotY: p.rotY ?? 0,
}))

const stairs: { x: number; z: number; dir: '+x'; low: number; high: number }[] = []
const heights: { x: number; z: number; y: number }[] = []
for (let k = 0; k < 8; k++) {
  const low = k * 0.5
  const high = low + 0.5
  for (let z = 18; z <= 21; z++) {
    stairs.push({ x: 18 + k, z, dir: '+x', low, high })
  }
}
for (let z = 17; z <= 22; z++) heights.push({ x: 26, z, y: 4 })
heights.push({ x: 26, z: 16, y: 4 }, { x: 27, z: 16, y: 4 }, { x: 26, z: 23, y: 4 }, { x: 27, z: 23, y: 4 })

writeFileSync(
  resolve(ROOT, 'data/sample.places.json'),
  JSON.stringify(
    {
      cell: 1,
      originX: ORIGIN_X,
      originZ: ORIGIN_Z,
      cols: 48,
      rows: 64,
      spawns: SAMPLE_SPAWNS.map((s) => ({ x: s.x, z: s.z })),
      patrol: [],
      parts,
    },
    null,
    2,
  ),
)
writeFileSync(
  resolve(ROOT, 'data/sample.override.json'),
  JSON.stringify({ walls: [], heights, stairs }, null, 2),
)

const baked = spawnSync(
  'npx',
  [
    'tsx',
    'scripts/height-from-glb.ts',
    '--places',
    'data/sample.places.json',
    '--override',
    'data/sample.override.json',
    '--glb',
    '/tmp/sample-height.glb',
    '--out',
    'data/sample-height.json',
    '--id',
    'sample',
  ],
  { cwd: ROOT, stdio: 'inherit' },
)
if (baked.status !== 0) process.exit(baked.status ?? 1)
