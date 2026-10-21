import type { OccBox, Place, WallBox } from './dungeon'

/** 寶物房樣本。格子 4m，與 KayKit floor_tile_large / wall 對齊。
 * 草圖高台標 +3；KayKit stairs_long 踏面實際落在 4，平台貼齊踏面才不會懸空或穿模。
 */
export const SAMPLE_OX = 20
export const SAMPLE_OZ = 220
export const SAMPLE_PLATFORM_Y = 4
const CELL = 4
const SKEL = '/assets/kaykit/skeletons'

type Cell = { gx: number; gz: number }

function rect(gx: number, gz: number, w: number, h: number): Cell[] {
  const out: Cell[] = []
  for (let z = gz; z < gz + h; z++) {
    for (let x = gx; x < gx + w; x++) out.push({ gx: x, gz: z })
  }
  return out
}

const GROUND: Cell[] = [
  ...rect(0, 0, 5, 5),
  ...rect(2, 5, 1, 3),
  ...rect(0, 8, 5, 4),
]
const PLATFORM: Cell[] = rect(5, 1, 3, 4)
const SPIKE = new Set(['0,10', '4,9'])
const PLATFORM_OPEN_WEST = new Set(['5,2', '5,3'])

function keyOf(gx: number, gz: number) {
  return `${gx},${gz}`
}

function outward(rotY: number): [number, number] {
  if (Math.abs(rotY - Math.PI) < 0.01) return [0, 1]
  if (Math.abs(rotY) < 0.01) return [0, -1]
  if (rotY < 0) return [1, 0]
  return [-1, 0]
}

function cellBox(c: Cell) {
  const x0 = SAMPLE_OX + c.gx * CELL
  const z0 = SAMPLE_OZ + c.gz * CELL
  return { x0, z0, x1: x0 + CELL, z1: z0 + CELL, cx: x0 + CELL / 2, cz: z0 + CELL / 2 }
}

function edgePlace(c: Cell, side: 'n' | 's' | 'e' | 'w', y: number, model: string): Place {
  const b = cellBox(c)
  const spec = {
    n: { x: b.cx, z: b.z1, rotY: Math.PI },
    s: { x: b.cx, z: b.z0, rotY: 0 },
    e: { x: b.x1, z: b.cz, rotY: -Math.PI / 2 },
    w: { x: b.x0, z: b.cz, rotY: Math.PI / 2 },
  }[side]
  const [ox, oz] = outward(spec.rotY)
  return {
    x: spec.x + ox * 0.5,
    y,
    z: spec.z + oz * 0.5,
    rotY: spec.rotY,
    model,
  }
}

function has(cells: Cell[], gx: number, gz: number) {
  return cells.some((c) => c.gx === gx && c.gz === gz)
}

const places: Place[] = []
const blockers: WallBox[] = []

function addWalls(cells: Cell[], y: number, skip?: { side: 'n' | 's' | 'e' | 'w'; keys: Set<string> }) {
  const seen = new Set<string>()
  for (const c of cells) {
    const sides: ['n' | 's' | 'e' | 'w', number, number][] = [
      ['n', 0, 1],
      ['s', 0, -1],
      ['e', 1, 0],
      ['w', -1, 0],
    ]
    for (const [side, dx, dz] of sides) {
      if (has(cells, c.gx + dx, c.gz + dz)) continue
      if (skip && side === skip.side && skip.keys.has(keyOf(c.gx, c.gz))) continue
      const edgeKey = side === 'n' || side === 's'
        ? `h:${c.gx}:${side === 'n' ? c.gz + 1 : c.gz}`
        : `v:${side === 'e' ? c.gx + 1 : c.gx}:${c.gz}`
      if (seen.has(edgeKey)) continue
      seen.add(edgeKey)
      let model = 'wall.gltf'
      const b = cellBox(c)
      if (y === 0 && side === 'n' && c.gx === 4 && c.gz === 11) model = 'wall_broken.gltf.glb'
      if (y === 0 && side === 'w' && c.gx === 0 && c.gz === 10) model = 'wall_cracked.gltf.glb'
      const place = edgePlace(c, side, y, model)
      places.push(place)
      const alongX = side === 'n' || side === 's'
      blockers.push(
        alongX
          ? { cx: place.x, cz: place.z, hx: 2, hz: 0.5 }
          : { cx: place.x, cz: place.z, hx: 0.5, hz: 2 },
      )
      void b
    }
  }
}

function exteriorSide(
  cells: Cell[],
  c: Cell,
  side: 'n' | 's' | 'e' | 'w',
  dx: number,
  dz: number,
  skip?: { side: 'n' | 's' | 'e' | 'w'; keys: Set<string> },
) {
  if (has(cells, c.gx + dx, c.gz + dz)) return false
  if (skip && side === skip.side && skip.keys.has(keyOf(c.gx, c.gz))) return false
  return true
}

/** wall_corner 是 L 形，兩臂朝外，補滿兩面外牆交會的 1m 缺口。 */
function addCorners(cells: Cell[], y: number, skip?: { side: 'n' | 's' | 'e' | 'w'; keys: Set<string> }) {
  const specs: ['n' | 's' | 'e' | 'w', 'n' | 's' | 'e' | 'w', number, number, number][] = [
    ['n', 'e', 1, 1, Math.PI / 2],
    ['s', 'e', 1, -1, Math.PI],
    ['s', 'w', -1, -1, -Math.PI / 2],
    ['n', 'w', -1, 1, 0],
  ]
  const seen = new Set<string>()
  for (const c of cells) {
    const b = cellBox(c)
    for (const [sideA, sideB, dx, dzSign, rotY] of specs) {
      const aDx = sideA === 'e' ? 1 : sideA === 'w' ? -1 : 0
      const aDz = sideA === 'n' ? 1 : sideA === 's' ? -1 : 0
      const bDx = sideB === 'e' ? 1 : sideB === 'w' ? -1 : 0
      const bDz = sideB === 'n' ? 1 : sideB === 's' ? -1 : 0
      if (!exteriorSide(cells, c, sideA, aDx, aDz, skip)) continue
      if (!exteriorSide(cells, c, sideB, bDx, bDz, skip)) continue
      const x = (dx > 0 ? b.x1 : b.x0) + dx * 0.5
      const z = (dzSign > 0 ? b.z1 : b.z0) + dzSign * 0.5
      const key = `${x.toFixed(2)},${z.toFixed(2)},${y}`
      if (seen.has(key)) continue
      seen.add(key)
      places.push({ x, y, z, rotY, model: 'wall_corner.gltf.glb' })
    }
  }
}

function addFloors(cells: Cell[], y: number, spiked: boolean) {
  for (const c of cells) {
    const b = cellBox(c)
    const spike = spiked && SPIKE.has(keyOf(c.gx, c.gz))
    places.push({
      x: b.cx,
      y: y - 0.05,
      z: b.cz,
      rotY: ((c.gx + c.gz) % 2) * Math.PI * 0.5,
      model: spike ? 'floor_tile_big_spikes.glb' : 'floor_tile_large.gltf',
    })
  }
}

addFloors(GROUND, 0, true)
addFloors(PLATFORM, SAMPLE_PLATFORM_Y, false)
const HALL_OPEN_EAST = { side: 'e' as const, keys: new Set(['4,2', '4,3']) }
const PLATFORM_OPEN = { side: 'w' as const, keys: PLATFORM_OPEN_WEST }
addWalls(GROUND, 0, HALL_OPEN_EAST)
addWalls(PLATFORM, SAMPLE_PLATFORM_Y - 0.05, PLATFORM_OPEN)
addCorners(GROUND, 0, HALL_OPEN_EAST)
addCorners(PLATFORM, SAMPLE_PLATFORM_Y - 0.05, PLATFORM_OPEN)

function doorway(gx: number, gz: number) {
  const c = { gx, gz }
  const place = edgePlace(c, 's', 0, 'wall_doorway.gltf')
  places.push(place)
  blockers.push({ cx: place.x - 1.5, cz: place.z, hx: 0.5, hz: 0.5 })
  blockers.push({ cx: place.x + 1.5, cz: place.z, hx: 0.5, hz: 0.5 })
}

doorway(2, 8)
doorway(2, 5)

function torch(c: Cell, side: 'n' | 's' | 'e' | 'w', y: number) {
  const wall = edgePlace(c, side, y + 2.35, 'torch_mounted.gltf')
  const [ox, oz] = outward(wall.rotY)
  places.push({ ...wall, x: wall.x - ox * 0.52, z: wall.z - oz * 0.52 })
}

torch({ gx: 0, gz: 8 }, 'w', 0)
torch({ gx: 4, gz: 8 }, 'e', 0)
torch({ gx: 1, gz: 11 }, 'n', 0)
torch({ gx: 3, gz: 11 }, 'n', 0)
torch({ gx: 2, gz: 6 }, 'w', 0)
torch({ gx: 2, gz: 6 }, 'e', 0)
torch({ gx: 0, gz: 2 }, 'w', 0)
torch({ gx: 4, gz: 1 }, 'e', 0)
torch({ gx: 2, gz: 0 }, 's', 0)
torch({ gx: 6, gz: 4 }, 'n', SAMPLE_PLATFORM_Y)
torch({ gx: 7, gz: 2 }, 'e', SAMPLE_PLATFORM_Y)

type Prop = Place & { hx?: number; hz?: number }

function prop(p: Prop) {
  places.push(p)
  if (p.hx && p.hz) blockers.push({ cx: p.x, cz: p.z, hx: p.hx, hz: p.hz })
}

const PY = SAMPLE_PLATFORM_Y

prop({ x: 25.2, y: 0, z: 261.0, rotY: 0.1, model: 'chest_gold.glb', hx: 0.85, hz: 0.75 })
prop({ x: 35.6, y: 0, z: 261.0, rotY: -0.1, model: 'chest_gold.glb', hx: 0.85, hz: 0.75 })
prop({ x: 28.2, y: 0, z: 260.8, rotY: 0.1, model: 'coin_stack_large.gltf.glb', hx: 0.75, hz: 0.85 })
prop({ x: 30.2, y: 0, z: 260.6, rotY: -0.1, model: 'coin_stack_medium.gltf.glb', hx: 0.55, hz: 0.55 })
prop({ x: 32.2, y: 0, z: 260.8, rotY: 0.2, model: 'coin_stack_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 23.2, y: 0, z: 255.6, rotY: 0.1, model: 'crates_stacked.gltf', hx: 1.1, hz: 1.2 })
prop({ x: 30.2, y: 0, z: 256.6, rotY: 0, model: 'box_stacked.gltf.glb', hx: 1.8, hz: 1.9 })
prop({ x: 38.3, y: 0, z: 266.4, rotY: 0.05, model: 'box_large.gltf.glb', hx: 0.75, hz: 0.75 })
prop({ x: 37.8, y: 0, z: 261.8, rotY: 0.1, model: 'barrel_large.gltf.glb', hx: 0.9, hz: 0.9 })
prop({ x: 21.3, y: 0, z: 258.6, rotY: 0.05, model: 'barrel_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 23.2, y: 0, z: 258.4, rotY: 0.05, model: 'pillar.gltf', hx: 0.75, hz: 0.75 })
prop({ x: 36.4, y: 0, z: 254.8, rotY: 0.05, model: 'pillar_decorated.gltf.glb', hx: 1.15, hz: 1 })
prop({ x: 20.55, y: -0.531, z: 256.2, rotY: Math.PI / 2, model: 'banner_red.gltf.glb' })
prop({ x: 39.25, y: -0.531, z: 264.2, rotY: -Math.PI / 2, model: 'banner_red.gltf.glb' })
prop({ x: 30, y: 0, z: 263.9, rotY: 0, model: 'rubble_large.gltf.glb', hx: 4.1, hz: 1.6 })
prop({ x: 20.35, y: 0, z: 266.15, rotY: 0, model: 'rubble_half.gltf.glb', hx: 2, hz: 1.55 })
prop({ x: 36.2, y: 0, z: 264.2, rotY: 0.05, model: 'skeleton_fallen.glb', root: SKEL, hx: 1.8, hz: 1.1 })
prop({ x: 34.6, y: 0, z: 266.35, rotY: -0.2, model: 'skeleton_guard.glb', root: SKEL, hx: 0.85, hz: 0.85 })

prop({ x: 28.75, y: 0, z: 243.3, rotY: 0.05, model: 'barrel_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 31.15, y: 0, z: 247.2, rotY: 0.05, model: 'barrel_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 28.95, y: 0, z: 248.5, rotY: 0, model: 'box_large.gltf.glb', hx: 0.75, hz: 0.75 })
prop({ x: 31.15, y: 0, z: 243.4, rotY: 0.1, model: 'coin_stack_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 31.05, y: 0, z: 249.4, rotY: 0, model: 'coin_stack_medium.gltf.glb', hx: 0.55, hz: 0.55 })
prop({ x: 30.05, y: 0, z: 245.6, rotY: 0.15, model: 'skeleton_minion.glb', root: SKEL, hx: 0.9, hz: 1.1 })
prop({ x: 27.62, y: -0.531, z: 250.2, rotY: Math.PI / 2, model: 'banner_red.gltf.glb' })
prop({ x: 30.9, y: 0, z: 248.6, rotY: 0.1, model: 'coin_stack_small.gltf.glb', hx: 0.5, hz: 0.5 })

const stairX = 40
const stairZ = 232
places.push({ x: stairX, y: 0, z: stairZ, rotY: -Math.PI / 2, model: 'stairs_long.gltf' })

prop({ x: 26.4, y: 0, z: 223.2, rotY: 0.1, model: 'keg.gltf.glb', hx: 0.95, hz: 1.05 })
prop({ x: 22.2, y: 0, z: 226.6, rotY: 0, model: 'barrel_large.gltf.glb', hx: 0.9, hz: 0.9 })
prop({ x: 25.2, y: 0, z: 226.6, rotY: 0.1, model: 'barrel_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 23.4, y: 0, z: 237.2, rotY: 0.05, model: 'crates_stacked.gltf', hx: 1.1, hz: 1.2 })
prop({ x: 36.2, y: 0, z: 224.6, rotY: 0, model: 'box_stacked.gltf.glb', hx: 1.8, hz: 1.9 })
prop({ x: 20.45, y: 0, z: 222.3, rotY: 0, model: 'rubble_half.gltf.glb', hx: 2, hz: 1.55 })
prop({ x: 20.45, y: 0, z: 234.2, rotY: 0, model: 'rubble_half.gltf.glb', hx: 2, hz: 1.55 })
prop({ x: 20.55, y: -0.531, z: 230.2, rotY: Math.PI / 2, model: 'banner_red.gltf.glb' })
prop({ x: 26.6, y: 0, z: 237.3, rotY: 0.05, model: 'pillar.gltf', hx: 0.75, hz: 0.75 })
prop({ x: 26.8, y: 0, z: 231.6, rotY: 0.4, model: 'skeleton_guard.glb', root: SKEL, hx: 0.85, hz: 0.85 })
prop({ x: 28.4, y: 0, z: 225.4, rotY: 0.1, model: 'chest_gold.glb', hx: 0.85, hz: 0.75 })
prop({ x: 40.75, y: PY, z: 228.55, rotY: 0, model: 'pillar.gltf', hx: 0.75, hz: 0.75 })
prop({ x: 40.75, y: PY, z: 235.45, rotY: 0, model: 'pillar.gltf', hx: 0.75, hz: 0.75 })

prop({ x: 46.2, y: PY, z: 234.2, rotY: 0.1, model: 'chest_gold.glb', hx: 0.85, hz: 0.75 })
prop({ x: 44.2, y: PY, z: 232.4, rotY: 0.1, model: 'coin_stack_large.gltf.glb', hx: 0.75, hz: 0.85 })
prop({ x: 47.6, y: PY, z: 235.6, rotY: -0.2, model: 'coin_stack_medium.gltf.glb', hx: 0.55, hz: 0.55 })
prop({ x: 44.4, y: PY, z: 235.2, rotY: 0.2, model: 'coin_stack_small.gltf.glb', hx: 0.5, hz: 0.5 })
prop({ x: 50.2, y: PY, z: 228.2, rotY: 0.1, model: 'barrel_large.gltf.glb', hx: 0.9, hz: 0.9 })
prop({ x: 45.2, y: PY - 0.531, z: 240, rotY: Math.PI, model: 'banner_red.gltf.glb' })
prop({ x: 49.2, y: PY, z: 236.2, rotY: 0.1, model: 'pillar_decorated.gltf.glb', hx: 1.15, hz: 1 })
prop({ x: 50.4, y: PY, z: 232.2, rotY: 0.1, model: 'box_large.gltf.glb', hx: 0.75, hz: 0.75 })
prop({ x: 43.2, y: PY, z: 227.2, rotY: 0.15, model: 'keg.gltf.glb', hx: 0.95, hz: 1.05 })
prop({ x: 42.3, y: PY, z: 237.4, rotY: 0, model: 'rubble_half.gltf.glb', hx: 2, hz: 1.55 })
prop({ x: 46.4, y: PY, z: 226.8, rotY: 0.3, model: 'skeleton_fallen.glb', root: SKEL, hx: 1.8, hz: 1.1 })

const treads: [number, number, number][] = [
  [32.05, 33.05, 0.5],
  [33.05, 34.05, 1],
  [34.05, 35.05, 1.5],
  [35.05, 36.05, 2],
  [36.05, 37.05, 2.5],
  [37.05, 38.05, 3],
  [38.05, 39.05, 3.5],
  [39.05, 40, 4],
]

export const SAMPLE_PLATFORMS = [
  ...treads.map(([x0, x1, topY]) => ({
    minX: x0,
    maxX: x1,
    minZ: stairZ - 2.55,
    maxZ: stairZ + 2.55,
    topY,
  })),
  { minX: 40, maxX: 52, minZ: 224, maxZ: 240, topY: SAMPLE_PLATFORM_Y },
]

export const SAMPLE_PLACES = places
export const SAMPLE_WALLS: WallBox[] = blockers

export const SAMPLE_OCCLUDERS: OccBox[] = blockers.map((w) => ({
  minX: w.cx - w.hx,
  maxX: w.cx + w.hx,
  minY: 0,
  maxY: w.cz > 224 && w.cx > 40 ? SAMPLE_PLATFORM_Y + 4 : 4.2,
  minZ: w.cz - w.hz,
  maxZ: w.cz + w.hz,
}))

export const SAMPLE_TORCHES = places
  .filter((p) => p.model.startsWith('torch'))
  .map((p) => {
    const [ox, oz] = outward(p.rotY)
    return { x: p.x - ox * 0.35, y: p.y + 0.5, z: p.z - oz * 0.35 }
  })

export const SAMPLE_DOORWAYS = places
  .filter((p) => p.model === 'wall_doorway.gltf')
  .map((p) => ({ x: p.x, z: p.z, rotY: p.rotY }))

export const SAMPLE_SPAWNS = [
  { x: 30, z: 246 },
  { x: 26, z: 226 },
]

export const SAMPLE_BOUNDS = { minX: 18, maxX: 54, minZ: 218, maxZ: 270 }

export const SAMPLE_FLOOR_RECTS = [
  ...GROUND.map((c) => {
    const b = cellBox(c)
    return { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 }
  }),
  ...PLATFORM.map((c) => {
    const b = cellBox(c)
    return { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 }
  }),
]

export function sampleWalkable(x: number, z: number, r = 0) {
  const pts: [number, number][] = [
    [x, z],
    [x + r, z],
    [x - r, z],
    [x, z + r],
    [x, z - r],
  ]
  return pts.every(([px, pz]) =>
    SAMPLE_FLOOR_RECTS.some((b) => px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ),
  )
}

export const SAMPLE_ZONES = {
  treasure: { minX: 20, maxX: 40, minZ: 252, maxZ: 268 },
  corridor: { minX: 28, maxX: 32, minZ: 240, maxZ: 252 },
  hall: { minX: 20, maxX: 40, minZ: 220, maxZ: 240 },
  platform: { minX: 40, maxX: 52, minZ: 224, maxZ: 240 },
} as const

function countsAsProp(model: string) {
  if (model.includes('spike')) return true
  if (model.startsWith('floor_') || model.startsWith('wall') || model.startsWith('ceiling')) return false
  return true
}

export function samplePropCount(zone: keyof typeof SAMPLE_ZONES) {
  const b = SAMPLE_ZONES[zone]
  return places.filter(
    (p) =>
      countsAsProp(p.model) &&
      p.x >= b.minX &&
      p.x <= b.maxX &&
      p.z >= b.minZ &&
      p.z <= b.maxZ &&
      (zone === 'platform' ? p.y >= SAMPLE_PLATFORM_Y - 1 : p.y < SAMPLE_PLATFORM_Y),
  ).length
}

export const SAMPLE_SHOTS = {
  overview: {
    pos: [36, 54, 244] as [number, number, number],
    look: [36, 0, 244] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
  },
  entrance: {
    pos: [28.15, 3.13, 241.81] as [number, number, number],
    look: [30, 1.5, 253.5] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
  },
  stairs: {
    pos: [26.2, 1.55, 229.4] as [number, number, number],
    look: [46, 5.4, 232.4] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
  },
}
