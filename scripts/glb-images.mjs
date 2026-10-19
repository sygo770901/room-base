import { readFileSync } from 'node:fs'
const buf = readFileSync('scripts/kenney-src/Models/GLB format/template-wall.glb')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
console.log('images', JSON.stringify(json.images, null, 2))
console.log('buffers', JSON.stringify(json.buffers, null, 2))
