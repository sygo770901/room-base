import { doorsOf } from '../shared/mapData.ts'
import { createDoors, nearestDoor } from '../shared/doors.ts'

for (const scene of ['kenney', 'kaykit', 'jungle'] as const) {
  const defs = doorsOf(scene)
  if (defs.length < 4) throw new Error(`${scene} 門太少`)
  const doors = createDoors(defs)
  if (doors.length !== defs.length) throw new Error(`${scene} createDoors 數量不對`)
  const enter = nearestDoor(78, 34, defs, 1.5)
  if (!enter) throw new Error(`${scene} 入口沒有門`)
}

if (doorsOf('kenney') === doorsOf('kaykit')) throw new Error('各地圖應各自一份清單')
if (doorsOf('future-map').length === 0) throw new Error('未知地圖至少要有預設門')

const kenney = doorsOf('kenney')
for (const scene of ['kaykit', 'jungle'] as const) {
  const other = doorsOf(scene)
  if (other.length !== kenney.length) throw new Error(`${scene} 門數量應與 kenney 相同`)
  for (const def of kenney) {
    const match = other.find((d) => d.id === def.id)
    if (!match || match.x !== def.x || match.z !== def.z || match.rotY !== def.rotY) {
      throw new Error(`${scene} ${def.id} 座標必須和伺服器清單、碰撞相同`)
    }
  }
}

console.log('doors-of: ok', doorsOf('jungle').map((d) => d.id).join(','))
