import { closedDoorAabbs, type DoorState } from './doors.ts'
import { heightFieldOf } from './heightmaps.ts'
import { doorsOf, extraAabbsOf, platformsOf } from './mapData.ts'

/** 伺服器與客戶端共用的這張圖碰撞。牆、樹、關門，加上高度圖或平面邊界。 */
export function sceneMoveArgs(scene?: string | null, doors?: DoorState[]) {
  return {
    nav: heightFieldOf(scene),
    platforms: platformsOf(scene),
    extra: extraAabbsOf(scene).concat(closedDoorAabbs(doors, doorsOf(scene))),
  }
}
