import type { DoorDef } from './doors'

/** 通道門口。三張地圖共用這份，模型與伺服器門清單都從這裡來。 */
export const DOORWAY_DEFS: DoorDef[] = [
  { id: 'door-enter', x: 78, z: 34, rotY: 0 },
  { id: 'door-chapel', x: 78, z: 106, rotY: 0 },
  { id: 'door-west', x: 30, z: 66, rotY: 0 },
  { id: 'door-library', x: 134, z: 70, rotY: 0 },
  { id: 'door-vault', x: 116, z: 28, rotY: Math.PI / 2 },
  { id: 'door-boss', x: 134, z: 114, rotY: 0 },
]

export function doorwayPlaces() {
  return DOORWAY_DEFS.map((d) => ({ id: d.id, x: d.x, z: d.z, rotY: d.rotY }))
}
