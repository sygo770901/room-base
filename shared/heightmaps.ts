import raw from '../data/heightlab.json'
import sampleRaw from '../data/sample-height.json'
import { SPAWN_POINTS } from './dungeon.ts'
import { groundY, parseHeightField, type HeightField, type StairCell } from './heightfield.ts'
import { SAMPLE_SPAWNS, SAMPLE_STAIR_RAMP, sampleSpikeAt, sampleSurfaceY } from './sampleRoom.ts'

const HEIGHTLAB = parseHeightField(raw)
const SAMPLE = repairSampleField(parseHeightField(sampleRaw))

/**
 * 高台邊緣被牆三角形挖成空格，地刺仍是地面。地板補回 0 或 4，地刺挖空。
 * 樓梯模型維持踏面；腳下改成連續斜坡，相鄰格子首尾相接，沒有垂直階。
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
  const ramp = SAMPLE_STAIR_RAMP
  const cx0 = Math.round((ramp.x0 - field.originX) / field.cell)
  const cx1 = Math.round((ramp.x1 - field.originX) / field.cell)
  const cz0 = Math.round((ramp.z0 - field.originZ) / field.cell)
  const cz1 = Math.round((ramp.z1 - field.originZ) / field.cell)
  for (let cz = cz0 - 1; cz <= cz1; cz++) {
    for (let cx = cx0; cx < cx1; cx++) {
      const x = field.originX + (cx + 0.5) * field.cell
      const z = field.originZ + (cz + 0.5) * field.cell
      cells[cz * field.cols + cx] = sampleSurfaceY(x, z)
    }
  }
  const run = ramp.x1 - ramp.x0
  const rise = (ramp.y1 - ramp.y0) / run
  for (let cx = cx0; cx < cx1; cx++) {
    const x0 = field.originX + cx * field.cell
    const low = ramp.y0 + (x0 - ramp.x0) * rise
    const high = low + rise * field.cell
    for (let cz = cz0; cz < cz1; cz++) {
      cells[cz * field.cols + cx] = low
      stairs.push({ x: cx, z: cz, dir: '+x', low, high })
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
