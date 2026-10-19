/** Kenney Modular Dungeon Kit（CC0）拼在 4m 格子上。牆厚約 2m，擺在走道外側。 */

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
  model: string
  scale?: number
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
  model: 'knight' | 'barbarian' | 'rogue' | 'mage' | 'ranger'
  kind?: 'grunt' | 'duck-king' | 'dispenser'
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

export const FLOOR_CENTERS: PatrolPoint[] = []
for (let z = 1; z < MAP_H - 1; z++) {
  for (let x = 1; x < MAP_W - 1; x++) {
    if (isFloorCell(x, z)) FLOOR_CENTERS.push(cellCenter(x, z))
  }
}

const floorPlaces: Place[] = []
const floorDecals: Place[] = []
const wallPlaces: Place[] = []
const cornerPlaces: Place[] = []
const wallBoxes: WallBox[] = []
const cornerSeen = new Set<string>()

function addCorner(x: number, z: number, rotY: number) {
  const key = `${x},${z}`
  if (cornerSeen.has(key)) return
  cornerSeen.add(key)
  cornerPlaces.push({ x, y: 0, z, rotY, model: 'template-wall-corner.glb', scale: 2 })
  const ox = rotY === 0 || rotY === Math.PI / 2 ? -1 : 1
  const oz = rotY === 0 || rotY === -Math.PI / 2 ? -1 : 1
  wallBoxes.push({ cx: x + ox, cz: z + oz, hx: 1, hz: 1 })
}

for (let z = 0; z < MAP_H; z++) {
  for (let x = 0; x < MAP_W; x++) {
    if (!floor[z][x]) continue
    const cx = (x + 0.5) * CELL
    const cz = (z + 0.5) * CELL
    floorPlaces.push({ x: cx, y: -0.5, z: cz, rotY: 0, model: 'template-floor-layer.glb' })
    if ((x * 3 + z) % 4 === 0) {
      floorDecals.push({
        x: cx,
        y: 0.02,
        z: cz,
        rotY: (x + z) % 2 ? Math.PI / 2 : 0,
        model: (x + z) % 8 === 0 ? 'template-floor-detail-a.glb' : 'template-floor-detail.glb',
      })
    }
    let north = false
    let south = false
    let east = false
    let west = false
    const edges: [number, number, number, number, number, 'n' | 's' | 'e' | 'w'][] = [
      [0, 1, cx, (z + 1) * CELL, Math.PI, 'n'],
      [0, -1, cx, z * CELL, 0, 's'],
      [1, 0, (x + 1) * CELL, cz, -Math.PI / 2, 'e'],
      [-1, 0, x * CELL, cz, Math.PI / 2, 'w'],
    ]
    for (const [dx, dz, wx, wz, rot, side] of edges) {
      if (isFloorCell(x + dx, z + dz)) continue
      if (side === 'n') north = true
      if (side === 's') south = true
      if (side === 'e') east = true
      if (side === 'w') west = true
      const detailed = (x * 5 + z * 3 + (side === 'n' ? 1 : 0)) % 6 === 0
      wallPlaces.push({
        x: wx,
        y: 0,
        z: wz,
        rotY: rot,
        model: detailed ? 'template-wall-detail-a.glb' : 'template-wall.glb',
      })
      if (side === 'n' || side === 's') {
        wallBoxes.push({ cx: wx, cz: wz + (side === 'n' ? 1 : -1), hx: 2, hz: 1 })
      } else {
        wallBoxes.push({ cx: wx + (side === 'e' ? 1 : -1), cz: wz, hx: 1, hz: 2 })
      }
    }
    if (north && east) addCorner((x + 1) * CELL, (z + 1) * CELL, Math.PI)
    if (north && west) addCorner(x * CELL, (z + 1) * CELL, Math.PI / 2)
    if (south && east) addCorner((x + 1) * CELL, z * CELL, -Math.PI / 2)
    if (south && west) addCorner(x * CELL, z * CELL, 0)
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

const hideSpots: PatrolPoint[] = []
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

for (let z = 2; z < MAP_H - 2; z++) {
  for (let x = 2; x < MAP_W - 2; x++) {
    if (!isOpen(x, z)) continue
    if (x >= 16 && x <= 24 && z >= 2 && z <= 8) continue
    if ((x * 5 + z * 3) % 11 !== 0) continue
    addProp('template-detail.glb', x, z, 0, 0, 0.75, 0.75, true)
    const c = cellCenter(x, z)
    hideSpots.push({ x: c.x + 1.15, z: c.z })
  }
}

for (const [gx, gz] of deadEnds) {
  if (rogueKeys.has(keyOf(gx, gz))) continue
  if (gx >= 14 && gx <= 26 && gz >= 2 && gz <= 7) continue
  let ox = 0
  let oz = -1
  for (const [dx, dz] of DIRS) {
    if (isFloorCell(gx + dx, gz + dz)) {
      ox = dx
      oz = dz
    }
  }
  addProp('template-detail.glb', gx, gz, 0, 0, 0.75, 0.75, true, false, -ox * 0.85, -oz * 0.85)
  const c = cellCenter(gx, gz)
  hideSpots.push({ x: c.x + ox * 0.35, z: c.z + oz * 0.35 })
}

const propBoxes: WallBox[] = props
  .filter((p) => p.hx > 0 && p.hz > 0)
  .map((p) => ({ cx: p.x, cz: p.z, hx: p.hx, hz: p.hz }))

export const FLOOR_PLACES = floorPlaces
export const FLOOR_DECALS = floorDecals
export const WALL_PLACES = wallPlaces
export const CORNER_PLACES = cornerPlaces
export const PROP_LIST = props
export const HIDE_SPOTS = hideSpots
export const HIDE_RANGE = 1.35
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

const bossStart = patrol([
  [17, 4],
  [16, 4],
  [16, 5],
  [19, 7],
  [20, 12],
  [18, 14],
  [28, 14],
  [8, 14],
])

export const BOSS_DEFS: MonsterDef[] = [
  {
    id: 'duck-king',
    name: '鴨大王',
    model: 'ranger',
    kind: 'duck-king',
    maxHp: 220,
    patrol: bossStart.length ? bossStart : FLOOR_CENTERS.slice(0, 8),
  },
  {
    id: 'dispenser',
    name: '飲水機',
    model: 'mage',
    kind: 'dispenser',
    maxHp: 160,
    patrol: bossStart.length ? bossStart.slice(0, 3) : FLOOR_CENTERS.slice(0, 3),
  },
]

export function hasLineOfSight(x0: number, z0: number, x1: number, z1: number, extra: WallBox[] = []) {
  const dx = x1 - x0
  const dz = z1 - z0
  const dist = Math.hypot(dx, dz)
  if (dist < 0.2) return true
  const steps = Math.ceil(dist / 0.4)
  const blockers = extra.length ? SIGHT_BLOCKERS.concat(extra) : SIGHT_BLOCKERS
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + dx * t
    const z = z0 + dz * t
    if (!isWalkableWorld(x, z, 0)) return false
    for (const b of blockers) {
      if (x >= b.cx - b.hx && x <= b.cx + b.hx && z >= b.cz - b.hz && z <= b.cz + b.hz) return false
    }
  }
  return true
}

export type OccBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

function propTop(model: string) {
  if (model.startsWith('template-detail') || model.startsWith('pillar')) return 4.3
  return 1
}

export const CAMERA_OCCLUDERS: OccBox[] = [
  ...wallBoxes.map((w) => ({
    minX: w.cx - w.hx,
    maxX: w.cx + w.hx,
    minY: 0,
    maxY: 4,
    minZ: w.cz - w.hz,
    maxZ: w.cz + w.hz,
  })),
  ...props
    .filter((p) => p.hx > 0.15 && p.hz > 0.15)
    .map((p) => ({
      minX: p.x - p.hx,
      maxX: p.x + p.hx,
      minY: 0,
      maxY: propTop(p.model),
      minZ: p.z - p.hz,
      maxZ: p.z + p.hz,
    })),
]

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: OccBox) {
  let tmin = 0
  let tmax = Number.POSITIVE_INFINITY
  const span: [number, number, number, number][] = [
    [b.minX, b.maxX, ox, dx],
    [b.minY, b.maxY, oy, dy],
    [b.minZ, b.maxZ, oz, dz],
  ]
  for (const [min, max, o, d] of span) {
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return null
      continue
    }
    let t1 = (min - o) / d
    let t2 = (max - o) / d
    if (t1 > t2) {
      const s = t1
      t1 = t2
      t2 = s
    }
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }
  if (tmax < 0) return null
  return tmin >= 0 ? tmin : null
}

/** 從角色射向鏡頭，回傳最先被牆或道具擋住的距離。 */
export function rayOcclusion(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  extra: OccBox[] = [],
) {
  let best = maxDist
  const boxes = extra.length ? CAMERA_OCCLUDERS.concat(extra) : CAMERA_OCCLUDERS
  for (const b of boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b)
    if (t != null && t > 0.05 && t < best) best = t
  }
  return best
}
