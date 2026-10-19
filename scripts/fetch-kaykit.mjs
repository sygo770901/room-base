import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE =
  'https://gitlab.ati.ttu.ee/Multiplayer-arena-game/Multiplayer-arena-game-GameObjects/-/raw/ed599a24457fd4ea78f178ebabd9f0b2b71686e6/Assets/Packages/KayKit_DungeonRemastered_1.1_FREE/Assets/gltf'
const OUT = path.resolve('public/assets/kaykit/dungeon-1.1')
const NAMES = process.argv.slice(2)
if (NAMES.length === 0) {
  console.error('usage: node scripts/fetch-kaykit.mjs file.gltf ...')
  process.exit(1)
}
await mkdir(OUT, { recursive: true })
for (const name of NAMES) {
  const url = `${BASE}/${name}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error('FAIL', res.status, name)
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path.join(OUT, name), buf)
  console.log('ok', name, buf.length)
}
