import { createDoors, nearestDoor, toggleDoorOpen } from '../shared/doors.ts'
import { doorsOf } from '../shared/mapData.ts'

for (const scene of ['kenney', 'kaykit', 'jungle'] as const) {
  const defs = doorsOf(scene)
  const doors = createDoors(defs)
  const a = doors.map((d) => d.open)
  for (const def of defs) {
    const found = nearestDoor(def.x, def.z, defs, 2)
    if (!found || found.id !== def.id) throw new Error(`${scene} ${def.id} 站在門前找不到自己`)
    const first = toggleDoorOpen(doors, def.id, 1000)
    if (!first?.open) throw new Error(`${scene} ${def.id} 第一次沒打開`)
    const second = toggleDoorOpen(doors, def.id, 2000)
    if (second?.open) throw new Error(`${scene} ${def.id} 第二次沒關上`)
  }
  if (doors.length !== a.length) throw new Error(`${scene} 門數量變了`)
}

console.log('doors-toggle: ok')
