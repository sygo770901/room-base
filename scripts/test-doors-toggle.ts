import { createDoors, doorBox, doorSurfaceDist, nearestDoor, toggleDoorOpen } from '../shared/doors.ts'
import { doorsOf } from '../shared/mapData.ts'

for (const scene of ['kenney', 'kaykit', 'jungle'] as const) {
  const defs = doorsOf(scene)
  const doors = createDoors(defs)
  const a = doors.map((d) => d.open)
  for (const def of defs) {
    const box = doorBox(def)
    if (box.cx !== def.x || box.cz !== def.z) throw new Error(`${scene} ${def.id} 碰撞中心和模型座標不一致`)
    const found = nearestDoor(def.x, def.z, defs, 2)
    if (!found || found.id !== def.id) throw new Error(`${scene} ${def.id} 站在門前找不到自己`)
    const face = nearestDoor(box.cx, box.cz + box.hz + 0.4, defs, 2)
    if (!face || face.id !== def.id) throw new Error(`${scene} ${def.id} 貼門板表面應找得到`)
    if (doorSurfaceDist(box.cx, box.cz + box.hz + 0.4, def) > 0.41) throw new Error(`${scene} ${def.id} 表面距離不對`)
    const first = toggleDoorOpen(doors, def.id, 1000)
    if (!first?.open) throw new Error(`${scene} ${def.id} 第一次沒打開`)
    const second = toggleDoorOpen(doors, def.id, 2000)
    if (second?.open) throw new Error(`${scene} ${def.id} 第二次沒關上`)
  }
  if (doors.length !== a.length) throw new Error(`${scene} 門數量變了`)
}

console.log('doors-toggle: ok')
