import { writeFile } from 'node:fs/promises'
const url = 'https://kenney.nl/media/pages/assets/modular-dungeon-kit/7bed87605b-1771926065/kenney_modular-dungeon-kit_1.0.zip'
const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
if (!response.ok) throw new Error(String(response.status))
const buf = Buffer.from(await response.arrayBuffer())
await writeFile('scripts/kenney-dungeon.zip', buf)
console.log('bytes', buf.length)
