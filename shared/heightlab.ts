import places from '../data/heightlab.places.json'
import type { Place } from './dungeon'

type Part = { model: string; x: number; y: number; z: number; rotY?: number; scale?: number }

/** 高度試驗地圖的 KayKit 零件。碰撞不看這份，看 data/heightlab.json。 */
export const HEIGHTLAB_PLACES: Place[] = (places.parts as Part[]).map((part) => ({
  x: part.x,
  y: part.y,
  z: part.z,
  rotY: part.rotY ?? 0,
  model: part.model,
  scale: part.scale,
}))
