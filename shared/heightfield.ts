import type { OccBox } from './dungeon.ts'
import { JUMP_MAX_DELTA } from './movement.ts'

/** 一步能走上的最大高度。超過就是斷崖，只能跳下去、不能走上去。 */
export const MAX_STEP_UP = 0.65
/** 跳躍中，腳要比落點地面再高出這點，才算越過斷崖而不是穿進牆面。 */
export const JUMP_CLEAR = 0.08
export const EYE_HEIGHT = 1.45

export type StairDir = '+x' | '-x' | '+z' | '-z'

export type StairCell = {
  x: number
  z: number
  dir: StairDir
  low: number
  high: number
}

export type HeightSpawn = { x: number; z: number; y?: number }

export type HeightField = {
  id: string
  cell: number
  originX: number
  originZ: number
  cols: number
  rows: number
  /** 列優先。null 是牆或空地，數字是該格平面高度。樓梯格另外用 stairs 內插。 */
  cells: (number | null)[]
  stairs: StairCell[]
  spawns: HeightSpawn[]
  patrol: { x: number; z: number }[]
}

export type HeightOverride = {
  walls?: [number, number][]
  heights?: { x: number; z: number; y: number }[]
  stairs?: StairCell[]
}

type RawField = {
  id: string
  cell: number
  originX: number
  originZ: number
  cols: number
  rows: number
  rowsCells: (number | null)[][]
  stairs?: { x: number; z: number; dir: string; low: number; high: number }[]
  spawns?: HeightSpawn[]
  patrol?: { x: number; z: number }[]
}

function stairDir(dir: string): StairDir {
  if (dir === '+x' || dir === '-x' || dir === '+z' || dir === '-z') return dir
  throw new Error(`未知的樓梯方向 ${dir}`)
}

const stairMaps = new WeakMap<HeightField, Map<string, StairCell>>()

function stairMap(field: HeightField) {
  let map = stairMaps.get(field)
  if (!map) {
    map = new Map()
    for (const stair of field.stairs) map.set(`${stair.x},${stair.z}`, stair)
    stairMaps.set(field, map)
  }
  return map
}

export function parseHeightField(raw: RawField): HeightField {
  const cells: (number | null)[] = []
  for (const row of raw.rowsCells) cells.push(...row)
  if (cells.length !== raw.cols * raw.rows) {
    throw new Error(`height field ${raw.id} 格子數 ${cells.length} !== ${raw.cols}*${raw.rows}`)
  }
  return {
    id: raw.id,
    cell: raw.cell,
    originX: raw.originX,
    originZ: raw.originZ,
    cols: raw.cols,
    rows: raw.rows,
    cells,
    stairs: (raw.stairs ?? []).map((s) => ({ ...s, dir: stairDir(s.dir) })),
    spawns: raw.spawns ?? [],
    patrol: raw.patrol ?? [],
  }
}

export function cellCoord(field: HeightField, x: number, z: number) {
  const cx = Math.floor((x - field.originX) / field.cell)
  const cz = Math.floor((z - field.originZ) / field.cell)
  if (cx < 0 || cz < 0 || cx >= field.cols || cz >= field.rows) return null
  return { cx, cz }
}

/** 該世界座標的地面高度。牆、地圖外回 null。樓梯沿方向內插。 */
export function groundY(field: HeightField, x: number, z: number): number | null {
  const coord = cellCoord(field, x, z)
  if (!coord) return null
  const stair = stairMap(field).get(`${coord.cx},${coord.cz}`)
  if (stair) {
    const localX = (x - field.originX) / field.cell - coord.cx
    const localZ = (z - field.originZ) / field.cell - coord.cz
    let u = 0
    if (stair.dir === '+x') u = localX
    else if (stair.dir === '-x') u = 1 - localX
    else if (stair.dir === '+z') u = localZ
    else u = 1 - localZ
    if (u < 0) u = 0
    else if (u > 1) u = 1
    return stair.low + (stair.high - stair.low) * u
  }
  return field.cells[coord.cz * field.cols + coord.cx]
}

function radiusHitsWall(field: HeightField, x: number, z: number, radius: number) {
  if (radius <= 0) return false
  const pts: [number, number][] = [
    [x + radius, z],
    [x - radius, z],
    [x, z + radius],
    [x, z - radius],
  ]
  for (const [px, pz] of pts) {
    if (groundY(field, px, pz) == null) return true
  }
  return false
}

/**
 * 從 (x0,z0) 走到 (x1,z1)。
 * 穿牆不行。往上超過 MAX_STEP_UP 的斷崖不能走上去。往下（摔落）可以。
 * 跳躍時傳入腳的高度：路徑上腳已經高過落點，而且落差不超過 JUMP_MAX_DELTA，才可以橫移上去。
 * 樓梯內插後每小步上升量小，所以走得上去。
 */
export function canMoveTo(
  field: HeightField,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
  feetY0?: number,
  feetY1?: number,
) {
  const y0 = groundY(field, x0, z0)
  if (y0 == null) return false
  const dist = Math.hypot(x1 - x0, z1 - z0)
  const steps = Math.max(1, Math.ceil(dist / 0.2))
  let prev = y0
  const airborne = feetY0 != null
  const feetEnd = feetY1 ?? feetY0 ?? 0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const z = z0 + (z1 - z0) * t
    const y = groundY(field, x, z)
    if (y == null) return false
    if (y > prev + MAX_STEP_UP) {
      const feet = airborne ? (feetY0 as number) + (feetEnd - (feetY0 as number)) * t : -Infinity
      if (feet + JUMP_CLEAR < y) return false
      if (y - y0 > JUMP_MAX_DELTA) return false
    }
    if (radiusHitsWall(field, x, z, radius)) return false
    prev = y
  }
  return true
}

/**
 * 從這格走回出生點會被擋住的格子。
 * 往下摔可以，往上超過一步不行。跳上去的矮台摔得下來，所以算連著；封死的坑不算。
 */
export function unreachableFromSpawn(field: HeightField, radius = 0.26): string[] {
  const spawn = field.spawns[0]
  if (!spawn) return ['no-spawn']
  const start = cellCoord(field, spawn.x, spawn.z)
  if (!start || groundY(field, spawn.x, spawn.z) == null) return ['spawn-unwalkable']
  const key = (cx: number, cz: number) => `${cx},${cz}`
  const seen = new Set<string>([key(start.cx, start.cz)])
  const queue = [start]
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  while (queue.length) {
    const cur = queue.pop()!
    const ax = field.originX + (cur.cx + 0.5) * field.cell
    const az = field.originZ + (cur.cz + 0.5) * field.cell
    for (const [dx, dz] of dirs) {
      const cx = cur.cx + dx
      const cz = cur.cz + dz
      const id = key(cx, cz)
      if (seen.has(id)) continue
      if (cx < 0 || cz < 0 || cx >= field.cols || cz >= field.rows) continue
      const bx = field.originX + (cx + 0.5) * field.cell
      const bz = field.originZ + (cz + 0.5) * field.cell
      if (groundY(field, bx, bz) == null) continue
      // 鄰居要能踏進已經走得回出生點的這格（摔下來也算）。
      if (!canMoveTo(field, bx, bz, ax, az, radius)) continue
      seen.add(id)
      queue.push({ cx, cz })
    }
  }
  const missing: string[] = []
  for (let cz = 0; cz < field.rows; cz++) {
    for (let cx = 0; cx < field.cols; cx++) {
      const x = field.originX + (cx + 0.5) * field.cell
      const z = field.originZ + (cz + 0.5) * field.cell
      if (groundY(field, x, z) == null) continue
      if (!seen.has(key(cx, cz))) missing.push(key(cx, cz))
    }
  }
  return missing
}

/** 牆柱高度。高台上的側牆大約再高 4 公尺，8 蓋得住。 */
export const HEIGHT_WALL_TOP = 8

/**
 * 鏡頭用的實體。牆柱和樓梯體、薄地面的地下算擋住。
 * 高台樓板底下留空：人摔出邊緣時，鏡頭還站在平台上，視線從空氣裡看下去，
 * 不把整層樓板當成實體，否則會把鏡頭推進角色身體。
 */
export function heightPointSolid(field: HeightField, x: number, y: number, z: number) {
  const g = groundY(field, x, z)
  if (g == null) return y >= -0.25 && y <= HEIGHT_WALL_TOP
  if (y >= g - 0.05) return false
  const coord = cellCoord(field, x, z)
  const stair = coord ? stairMap(field).get(`${coord.cx},${coord.cz}`) : undefined
  if (stair) return true
  return g <= 0.35
}

/**
 * 胸口到鏡頭（含一點餘裕）有沒有穿進地面或牆柱。
 * 只看高度圖，不看平面地圖的牆盒。樓梯斜面以上的空氣不算擋住。
 */
export function heightCameraBlocked(
  field: HeightField,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dy, dz)
  if (dist < 0.04) return false
  const steps = Math.max(1, Math.ceil(dist / 0.08))
  for (let i = 1; i <= steps; i++) {
    const along = (dist * i) / steps
    if (along < 0.12) continue
    const t = i / steps
    if (heightPointSolid(field, x0 + dx * t, y0 + dy * t, z0 + dz * t)) return true
  }
  return false
}

/** 視線：牆擋住，或射線穿進地面體積（樓板）也擋住。沒有高度圖時不擋。 */
export function heightBlocksSight(
  field: HeightField | null,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  if (!field) return false
  const eye0 = y0 + EYE_HEIGHT
  const eye1 = y1 + EYE_HEIGHT
  const dist = Math.hypot(x1 - x0, z1 - z0, eye1 - eye0)
  if (dist < 0.2) return false
  const steps = Math.ceil(dist / 0.35)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = eye0 + (eye1 - eye0) * t
    const z = z0 + (z1 - z0) * t
    const g = groundY(field, x, z)
    if (g == null) return true
    if (y < g - 0.2) return true
  }
  return false
}

function cellTop(field: HeightField, cx: number, cz: number): number | null | undefined {
  if (cx < 0 || cz < 0 || cx >= field.cols || cz >= field.rows) return undefined
  const stair = stairMap(field).get(`${cx},${cz}`)
  if (stair) return stair.high
  return field.cells[cz * field.cols + cx]
}

/** 鏡頭遮擋：靠著走道的牆，以及抬高的樓板。空地不做成實心盒子。 */
export function heightOccluders(field: HeightField): OccBox[] {
  const boxes: OccBox[] = []
  const { cell, originX, originZ, cols, rows } = field
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const top = cellTop(field, cx, cz)
      const minX = originX + cx * cell
      const minZ = originZ + cz * cell
      const maxX = minX + cell
      const maxZ = minZ + cell
      if (top == null) {
        let touch = false
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = cellTop(field, cx + dx, cz + dz)
          if (typeof n === 'number') touch = true
        }
        if (!touch) continue
        boxes.push({ minX, maxX, minY: 0, maxY: 8, minZ, maxZ })
        continue
      }
      if (top > 0.75) boxes.push({ minX, maxX, minY: 0, maxY: top, minZ, maxZ })
    }
  }
  return boxes
}

export function applyHeightOverride(field: HeightField, ov: HeightOverride | null | undefined): HeightField {
  if (!ov) return field
  const cells = field.cells.slice()
  const drop = new Set<string>()
  for (const [x, z] of ov.walls ?? []) drop.add(`${x},${z}`)
  for (const h of ov.heights ?? []) drop.add(`${h.x},${h.z}`)
  for (const s of ov.stairs ?? []) drop.add(`${s.x},${s.z}`)
  const stairs = field.stairs.filter((s) => !drop.has(`${s.x},${s.z}`))
  const set = (x: number, z: number, value: number | null) => {
    if (x < 0 || z < 0 || x >= field.cols || z >= field.rows) return
    cells[z * field.cols + x] = value
  }
  for (const [x, z] of ov.walls ?? []) set(x, z, null)
  for (const h of ov.heights ?? []) set(h.x, h.z, h.y)
  for (const s of ov.stairs ?? []) {
    set(s.x, s.z, (s.low + s.high) / 2)
    stairs.push(s)
  }
  return { ...field, cells, stairs }
}
