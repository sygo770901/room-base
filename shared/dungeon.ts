/** KayKit Dungeon Pack 1.0（CC0）地城。格子 4m，牆厚 1.5m、高 4m。 */

export const CELL = 4
export const MAP_W = 42
export const MAP_H = 36
export const FLOOR_SINK = 1.06

export type WallBox = { cx: number; cz: number; hx: number; hz: number }

export interface Place {
  x: number
  y: number
  z: number
  rotY: number
}

export interface DungeonProp {
  id: string
  model: string
  x: number
  y: number
  z: number
  rotY: number
  hx: number
  hz: number
  blocksSight: boolean
  light: boolean
}

export interface PatrolPoint {
  x: number
  z: number
}

export interface MonsterDef {
  id: string
  name: string
  model: 'knight' | 'barbarian' | 'rogue' | 'mage'
  maxHp: number
  patrol: PatrolPoint[]
}

const floor: boolean[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))

function stamp(x: number, z: number, w: number, h: number) {
  for (let zz = z; zz < z + h; zz++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx > 0 && zz > 0 && xx < MAP_W - 1 && zz < MAP_H - 1) floor[zz][xx] = true
    }
  }
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 手工房間：入口、十字長廊、營房、書庫、寶庫、禮拜堂、側間
stamp(12, 2, 16, 6) // 入口大廳
stamp(18, 8, 4, 4) // 往北門廊
stamp(4, 12, 34, 4) // 東西長廊
stamp(18, 12, 4, 14) // 南北主廊
stamp(12, 26, 16, 6) // 北禮拜堂
stamp(2, 17, 10, 7) // 西營房
stamp(6, 15, 4, 2)
stamp(30, 17, 10, 8) // 東書庫
stamp(32, 15, 4, 3)
stamp(30, 4, 9, 6) // 東南寶庫
stamp(27, 5, 4, 3)
stamp(2, 2, 8, 6) // 西南地窖
stamp(9, 4, 4, 2)
stamp(4, 16, 3, 3)
stamp(8, 10, 3, 3)
stamp(32, 10, 3, 3)
stamp(36, 14, 3, 3)
stamp(14, 16, 4, 3)
stamp(24, 16, 4, 3)
stamp(6, 28, 5, 5)
stamp(8, 30, 5, 2)
stamp(31, 28, 6, 5)
stamp(27, 30, 5, 2)

function inMaze(x: number, z: number) {
  if (x < 1 || z < 1 || x >= MAP_W - 1 || z >= MAP_H - 1) return false
  const north = z >= 18 && z <= 34 && x >= 1 && x <= 40
  const west = x >= 1 && x <= 11 && z >= 8 && z <= 16
  const east = x >= 33 && x <= 40 && z >= 2 && z <= 11
  return north || west || east
}

function carveMaze() {
  const rand = mulberry32(0x4b6179)
  const dirs = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ] as const
  const visited = new Set<string>()
  for (let z = 1; z < MAP_H - 1; z += 2) {
    for (let x = 1; x < MAP_W - 1; x += 2) {
      if (!inMaze(x, z) || floor[z][x] || visited.has(`${x},${z}`)) continue
      const stack: [number, number][] = [[x, z]]
      visited.add(`${x},${z}`)
      floor[z][x] = true
      while (stack.length) {
        const [cx, cz] = stack[stack.length - 1]
        const nbs: [number, number][] = []
        for (const [dx, dz] of dirs) {
          const nx = cx + dx
          const nz = cz + dz
          if (!inMaze(nx, nz) || visited.has(`${nx},${nz}`)) continue
          if (floor[nz][nx]) {
            floor[cz + dz / 2][cx + dx / 2] = true
            continue
          }
          nbs.push([nx, nz])
        }
        if (!nbs.length) {
          stack.pop()
          continue
        }
        const [nx, nz] = nbs[Math.floor(rand() * nbs.length)]
        floor[cz + (nz - cz) / 2][cx + (nx - cx) / 2] = true
        floor[nz][nx] = true
        visited.add(`${nx},${nz}`)
        stack.push([nx, nz])
      }
    }
  }
}

function keyOf(x: number, z: number) {
  return x + z * MAP_W
}

function floodFrom(sx: number, sz: number) {
  const seen = new Set<number>()
  const q: [number, number][] = [[sx, sz]]
  seen.add(keyOf(sx, sz))
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i]
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const nz = z + dz
      if (!floor[nz]?.[nx] || seen.has(keyOf(nx, nz))) continue
      seen.add(keyOf(nx, nz))
      q.push([nx, nz])
    }
  }
  return seen
}

function connectAll(sx: number, sz: number) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  for (let guard = 0; guard < 24; guard++) {
    const main = floodFrom(sx, sz)
    let ox = -1
    let oz = -1
    for (let z = 1; z < MAP_H - 1 && ox < 0; z++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (floor[z][x] && !main.has(keyOf(x, z))) {
          ox = x
          oz = z
          break
        }
      }
    }
    if (ox < 0) return
    const prev = new Map<number, number>()
    const q: [number, number][] = [[ox, oz]]
    const vis = new Set<number>([keyOf(ox, oz)])
    let hit = -1
    for (let i = 0; i < q.length && hit < 0; i++) {
      const [x, z] = q[i]
      const k = keyOf(x, z)
      if (main.has(k) && !(x === ox && z === oz)) {
        hit = k
        break
      }
      for (const [dx, dz] of dirs) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 1 || nz < 1 || nx >= MAP_W - 1 || nz >= MAP_H - 1) continue
        const nk = keyOf(nx, nz)
        if (vis.has(nk)) continue
        vis.add(nk)
        prev.set(nk, k)
        q.push([nx, nz])
      }
    }
    if (hit < 0) return
    let c = hit
    while (c !== keyOf(ox, oz)) {
      floor[Math.floor(c / MAP_W)][c % MAP_W] = true
      const p = prev.get(c)
      if (p == null) break
      c = p
    }
  }
}

carveMaze()
connectAll(20, 5)

export function isFloorCell(gx: number, gz: number) {
  return floor[gz]?.[gx] === true
}

export function isWalkableWorld(x: number, z: number, r = 0) {
  const pts: [number, number][] = [
    [x, z],
    [x + r, z],
    [x - r, z],
    [x, z + r],
    [x, z - r],
  ]
  return pts.every(([px, pz]) => {
    const gx = Math.floor(px / CELL)
    const gz = Math.floor(pz / CELL)
    return isFloorCell(gx, gz)
  })
}

export function cellCenter(gx: number, gz: number): PatrolPoint {
  return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL }
}

const floorPlaces: Place[] = []
const wallPlaces: Place[] = []
const wallBoxes: WallBox[] = []

for (let z = 0; z < MAP_H; z++) {
  for (let x = 0; x < MAP_W; x++) {
    if (!floor[z][x]) continue
    floorPlaces.push({ x: (x + 0.5) * CELL, y: -FLOOR_SINK, z: (z + 0.5) * CELL, rotY: 0 })
    const edges: [number, number, number, number, number][] = [
      [0, 1, (x + 0.5) * CELL, (z + 1) * CELL, 0],
      [0, -1, (x + 0.5) * CELL, z * CELL, 0],
      [1, 0, (x + 1) * CELL, (z + 0.5) * CELL, Math.PI / 2],
      [-1, 0, x * CELL, (z + 0.5) * CELL, Math.PI / 2],
    ]
    for (const [dx, dz, wx, wz, rot] of edges) {
      if (isFloorCell(x + dx, z + dz)) continue
      wallPlaces.push({ x: wx, y: 0, z: wz, rotY: rot })
      const alongX = rot === 0
      wallBoxes.push({
        cx: wx,
        cz: wz,
        hx: alongX ? 2 : 0.75,
        hz: alongX ? 0.75 : 2,
      })
    }
  }
}

function neighbors(x: number, z: number) {
  let n = 0
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (isFloorCell(x + dx, z + dz)) n++
  }
  return n
}

const deadEnds: [number, number][] = []
for (let z = 1; z < MAP_H - 1; z++) {
  for (let x = 1; x < MAP_W - 1; x++) {
    if (floor[z][x] && neighbors(x, z) === 1) deadEnds.push([x, z])
  }
}

const rogueCells = deadEnds.filter(([x, z]) => z >= 20).slice(0, 6)
const rogueKeys = new Set(rogueCells.map(([x, z]) => keyOf(x, z)))

const props: DungeonProp[] = []
let propN = 0

function addProp(
  model: string,
  gx: number,
  gz: number,
  rotY: number,
  y: number,
  hx: number,
  hz: number,
  blocksSight: boolean,
  light = false,
  ox = 0,
  oz = 0,
) {
  if (!isFloorCell(gx, gz)) return
  const c = cellCenter(gx, gz)
  props.push({
    id: `p${propN++}`,
    model,
    x: c.x + ox,
    y,
    z: c.z + oz,
    rotY,
    hx,
    hz,
    blocksSight,
    light,
  })
}

// 柱子只放在四周都是地板的格子，避免堵住單格走廊
function isOpen(gx: number, gz: number) {
  return (
    isFloorCell(gx, gz) &&
    isFloorCell(gx + 1, gz) &&
    isFloorCell(gx - 1, gz) &&
    isFloorCell(gx, gz + 1) &&
    isFloorCell(gx, gz - 1)
  )
}

for (const [gx, gz] of [
  [14, 4],
  [26, 4],
  [15, 28],
  [25, 28],
  [6, 20],
  [8, 20],
  [33, 20],
  [36, 20],
] as const) {
  if (isOpen(gx, gz)) addProp('pillar.gltf.glb', gx, gz, 0, 0, 0.72, 0.72, true)
}

for (const [gx, gz] of [
  [33, 6],
  [36, 6],
  [34, 7],
] as const) {
  addProp('chest_common.gltf.glb', gx, gz, 0.4, 0, 0.7, 0.5, true)
}

for (const [gx, gz, rot] of [
  [32, 23, Math.PI],
  [35, 23, Math.PI],
  [38, 23, Math.PI],
  [31, 18, 0],
] as const) {
  addProp('bookcaseFilled.gltf.glb', gx, gz, rot, 0, 0.5, 0.28, true)
}

addProp('tableMedium.gltf.glb', 35, 20, 0.2, 0, 1, 0.6, true)
addProp('tableMedium.gltf.glb', 5, 20, 1.2, 0, 1, 0.6, true)
addProp('banner.gltf.glb', 16, 30, 0, 2.53, 0, 0, false)
addProp('banner.gltf.glb', 24, 30, Math.PI, 2.53, 0, 0, false)

let crateToggle = 0
for (const [gx, gz] of deadEnds) {
  if (rogueKeys.has(keyOf(gx, gz))) continue
  if (gx >= 14 && gx <= 26 && gz >= 2 && gz <= 7) continue
  if (crateToggle++ % 2 !== 0) continue
  const dark = (gx + gz) % 4 === 0
  addProp(dark ? 'crateDark.gltf.glb' : 'crate.gltf.glb', gx, gz, ((gx * 3) % 5) * 0.3, 0.53, 0.48, 0.48, true)
  if (props.length > 80) break
}

for (let x = 6; x <= 36; x += 5) {
  if (!isFloorCell(x, 13)) continue
  addProp('torch.gltf.glb', x, 13, 0, 0.7, 0, 0, false, true, 0, 1.15)
}
for (let z = 16; z <= 30; z += 4) {
  if (!isFloorCell(19, z)) continue
  addProp('torch.gltf.glb', 19, z, Math.PI / 2, 0.7, 0, 0, false, true, -1.15, 0)
}

for (const [gx, gz] of [
  [4, 4],
  [7, 5],
  [32, 5],
  [37, 8],
  [3, 19],
  [10, 21],
] as const) {
  addProp((gx + gz) % 2 ? 'barrelDark.gltf.glb' : 'barrel.gltf.glb', gx, gz, 0.5, 0.4, 0.42, 0.42, true)
  addProp('potA.gltf.glb', gx, gz, 0, 0, 0, 0, false, false, 0.7, 0.4)
}

const propBoxes: WallBox[] = props
  .filter((p) => p.hx > 0 && p.hz > 0)
  .map((p) => ({ cx: p.x, cz: p.z, hx: p.hx, hz: p.hz }))

export const FLOOR_PLACES = floorPlaces
export const WALL_PLACES = wallPlaces
export const PROP_LIST = props
export const ALL_BLOCKERS: WallBox[] = [...wallBoxes, ...propBoxes]
export const SIGHT_BLOCKERS: WallBox[] = [
  ...wallBoxes,
  ...props.filter((p) => p.blocksSight).map((p) => ({ cx: p.x, cz: p.z, hx: p.hx, hz: p.hz })),
]

export const ROOM_BOUNDS = {
  minX: 0,
  maxX: MAP_W * CELL,
  minZ: 0,
  maxZ: MAP_H * CELL,
}

export const SPAWN_GRID: [number, number][] = (
  [
    [18, 5],
    [20, 5],
    [22, 5],
    [19, 3],
    [21, 3],
    [20, 6],
  ] as [number, number][]
).filter(([x, z]) => isFloorCell(x, z))

export const SPAWN_POINTS: PatrolPoint[] = SPAWN_GRID.map(([x, z]) => cellCenter(x, z))

function patrol(cells: [number, number][]): PatrolPoint[] {
  return cells.filter(([x, z]) => isFloorCell(x, z)).map(([x, z]) => cellCenter(x, z))
}

const mazeLoop: [number, number][] = []
for (let z = 22; z <= 33; z += 3) {
  for (let x = 3; x <= 38; x += 6) {
    if (isFloorCell(x, z)) mazeLoop.push([x, z])
  }
}
const roguePatrol = patrol(
  (rogueCells.length >= 2 ? rogueCells : mazeLoop).concat(mazeLoop).slice(0, 8),
)

export const MONSTER_DEFS: MonsterDef[] = [
  {
    id: 'knight',
    name: '騎士',
    model: 'knight',
    maxHp: 120,
    patrol: patrol([
      [8, 14],
      [18, 14],
      [28, 14],
      [36, 13],
    ]),
  },
  {
    id: 'barbarian',
    name: '蠻族',
    model: 'barbarian',
    maxHp: 160,
    patrol: patrol([
      [20, 14],
      [20, 20],
      [20, 24],
      [20, 28],
      [16, 29],
      [24, 29],
    ]),
  },
  {
    id: 'mage',
    name: '法師',
    model: 'mage',
    maxHp: 90,
    patrol: patrol([
      [33, 20],
      [37, 20],
      [36, 22],
      [32, 19],
    ]),
  },
  {
    id: 'rogue',
    name: '盜賊',
    model: 'rogue',
    maxHp: 80,
    patrol: roguePatrol,
  },
]

export function hasLineOfSight(x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dz)
  if (dist < 0.2) return true
  const steps = Math.ceil(dist / 0.4)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + dx * t
    const z = z0 + dz * t
    if (!isWalkableWorld(x, z, 0)) return false
    for (const b of SIGHT_BLOCKERS) {
      if (x >= b.cx - b.hx && x <= b.cx + b.hx && z >= b.cz - b.hz && z <= b.cz + b.hz) return false
    }
  }
  return true
}
