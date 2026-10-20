import { doorToggleAim } from '../shared/doors.ts'
import { doorsOf } from '../shared/mapData.ts'

const defs = doorsOf('jungle')
const enter = defs[0]
if (!enter) throw new Error('沒有門')

const pos = { x: 80, z: 22 }
const far = doorToggleAim(pos.x, pos.z, { x: enter.x + 40, z: enter.z + 40, id: enter.id }, defs)
if (far.x !== pos.x || far.z !== pos.z) throw new Error('遠距座標不該被採用')
if (far.door) throw new Error('太遠不該開到門')

const near = doorToggleAim(enter.x + 0.4, enter.z + 0.4, { x: enter.x + 0.4, z: enter.z + 0.4, id: enter.id }, defs)
if (!near.door || near.door.id !== enter.id) throw new Error('門前應找得到門')
if (near.x !== enter.x + 0.4) throw new Error('應用客戶端座標判斷，但這不是寫回玩家位置')

const player = { position: [80, 0, 22] as [number, number, number] }
const before = player.position.slice()
doorToggleAim(player.position[0], player.position[2], { x: enter.x, z: enter.z }, defs)
if (player.position[0] !== before[0] || player.position[2] !== before[2]) {
  throw new Error('door:toggle 不可以改 player.position')
}

console.log('door-teleport: ok')
