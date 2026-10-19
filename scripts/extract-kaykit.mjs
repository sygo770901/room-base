import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ZipReader, BlobReader, BlobWriter } from 'https://esm.sh/@zip.js/zip.js'

const names = [
  'wall.gltf',
  'wall.bin',
  'wall_corner.gltf',
  'wall_corner.bin',
  'wall_doorway.gltf',
  'wall_doorway.bin',
  'wall_gated.gltf',
  'wall_gated.bin',
  'floor_tile_large.gltf',
  'floor_tile_large.bin',
  'floor_tile_small.gltf',
  'floor_tile_small.bin',
  'ceiling_tile.gltf',
  'ceiling_tile.bin',
  'stairs_wide.gltf',
  'stairs_wide.bin',
  'stairs_long.gltf',
  'stairs_long.bin',
  'torch_mounted.gltf',
  'torch_mounted.bin',
  'pillar.gltf',
  'pillar.bin',
  'column.gltf',
  'crates_stacked.gltf',
  'crates_stacked.bin',
  'dungeon_texture.png',
]
const zipPath = path.resolve('scripts/kaykit-1.1.zip')
const outDir = path.resolve('public/assets/kaykit/dungeon-1.1')
await mkdir(outDir, { recursive: true })
const data = await (await import('node:fs/promises')).readFile(zipPath)
const reader = new ZipReader(new BlobReader(new Blob([data])))
const entries = await reader.getEntries()
const want = new Set(names)
for (const entry of entries) {
  const base = entry.filename.split('/').pop()
  if (!want.has(base) || !entry.filename.includes('/gltf/')) continue
  const blob = await entry.getData(new BlobWriter())
  const buf = Buffer.from(await blob.arrayBuffer())
  await writeFile(path.join(outDir, base), buf)
  console.log('wrote', base, buf.length)
}
await reader.close()
