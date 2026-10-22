import raw from '../data/heightlab.json'
import sampleRaw from '../data/sample-height.json'
import { SPAWN_POINTS } from './dungeon.ts'
import { groundY, parseHeightField, type HeightField, type StairCell } from './heightfield.ts'
import { SAMPLE_SPAWNS, sampleSpikeAt, sampleSurfaceY } from './sampleRoom.ts'

const HEIGHTLAB = parseHeightField(raw)
const SAMPLE = repairSampleField(parseHeightField(sampleRaw))

/**
 * 烘圖把樓梯做成斜坡，高台邊緣被牆三角形挖成空格，地刺仍是地面。
 * 這裡改成跟模型一致：可見地板補回 0 或 4，地刺挖空，踏面改成每格平階。
 */
function repairSampleField(field: HeightField): HeightField {
  const cells = field.cells.slice()
  const stairs: StairCell[] = field.stairs.filter((s) => !(s.x >= 18 && s.x <= 25 && s.z >= 17 && s.z <= 22))
  for (let cz = 0; cz < field.rows; cz++) {
    for (let cx = 0; cx < field.cols; cx++) {
      const x = field.originX + (cx + 0.5) * field.cell
      const z = field.originZ + (cz + 0.5) * field.cell
      const i = cz * field.cols + cx
      if (sampleSpikeAt(x, z)) cells[i] = null
      else if (cells[i] == null) {
        const y = sampleSurfaceY(x, z)
        if (y != null) cells[i] = y
      }
    }
  }
  // 舊斜坡蓋住扶手和空氣。先還原成走廊地面，再只在踏面上寫平階。
  for (let cz = 17; cz <= 22; cz++) {
    for (let cx = 18; cx <= 25; cx++) {
      const x = field.originX + (cx + 0.5) * field.cell
      const z = field.originZ + (cz + 0.5) * field.cell
      cells[cz * field.cols + cx] = sampleSurfaceY(x, z)
    }
  }
  const treadH = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
  for (let k = 0; k < treadH.length; k++) {
    const cx = 18 + k
    const h = treadH[k]
    for (let cz = 18; cz <= 21; cz++) {
      cells[cz * field.cols + cx] = h
      stairs.push({ x: cx, z: cz, dir: '+x', low: h, high: h })
    }
  }
  return { ...field, cells, stairs }
}

/** 沒有高度圖的地圖（kenney / kaykit / jungle）回 null，碰撞維持原本的平面格子。 */
export function heightFieldOf(scene?: string | null): HeightField | null {
  if (scene === 'heightlab') return HEIGHTLAB
  if (scene === 'sample') return SAMPLE
  return null
}

export function spawnOf(scene: string | null | undefined, index: number) {
  const field = heightFieldOf(scene)
  if (field?.spawns.length) {
    const s = field.spawns[index % field.spawns.length]
    return { x: s.x, y: groundY(field, s.x, s.z) ?? s.y ?? 0, z: s.z }
  }
  const list = scene === 'sample' ? SAMPLE_SPAWNS : SPAWN_POINTS
  const sp = list[index % list.length]
  return { x: sp.x, y: 0, z: sp.z }
}
