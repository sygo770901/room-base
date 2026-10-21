import { doorHingeLocalX, doorLeafWidth, KAYKIT_DOOR_LEAF } from '../shared/doors.ts'
import { DOORWAY_DEFS, isBakedDoorMesh } from '../shared/doorways.ts'
import { doorsOf } from '../shared/mapData.ts'

if (!isBakedDoorMesh('wall_doorway_door')) throw new Error('門口模型裡的門板要拿掉')
if (!isBakedDoorMesh('Wall_Doorway_Door')) throw new Error('門板名稱不分大小寫')
if (isBakedDoorMesh('wall_doorway')) throw new Error('門框要留下')
if (isBakedDoorMesh('floor_tile_large')) throw new Error('地板不是門')

for (const scene of ['kaykit', 'jungle'] as const) {
  const width = doorLeafWidth(scene)
  if (width !== KAYKIT_DOOR_LEAF) throw new Error(`${scene} 門寬應貼著 KayKit 門框，實際 ${width}`)
  const hinge = doorHingeLocalX(width)
  if (hinge !== -width / 2) throw new Error(`${scene} 門軸應在門板側邊`)
  if (hinge + width / 2 !== 0) throw new Error(`${scene} 關門時門板應以門口為中心`)
  const defs = doorsOf(scene)
  const ids = defs.map((d) => d.id)
  if (new Set(ids).size !== ids.length) throw new Error(`${scene} 同一個門口有兩扇門`)
  if (defs.length !== DOORWAY_DEFS.length) throw new Error(`${scene} 門數量應和門口一樣`)
}

if (doorLeafWidth('kenney') === KAYKIT_DOOR_LEAF) throw new Error('Kenney 不用 KayKit 門寬')

console.log('kaykit-door: ok', doorsOf('kaykit').map((d) => d.id).join(','))
