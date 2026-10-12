import {
  FLOOR_PLACES,
  PROP_LIST,
  WALL_PLACES,
  type OccBox,
  type Place,
  type WallBox,
} from './dungeon'

/** 牆中心往走道外側挪 0.5m，內側面才會貼在 4m 格子邊上。 */
const OUT = 0.5

function outward(rotY: number): [number, number] {
  if (Math.abs(rotY - Math.PI) < 0.01) return [0, 1]
  if (Math.abs(rotY) < 0.01) return [0, -1]
  if (rotY < 0) return [1, 0]
  return [-1, 0]
}

function wallModel(x: number, z: number) {
  const n = Math.abs(Math.round(x) * 3 + Math.round(z) * 7)
  if (n % 9 === 0) return 'wall_doorway.gltf'
  if (n % 7 === 0) return 'wall_gated.gltf'
  return 'wall.gltf'
}

const places: Place[] = []

for (const floor of FLOOR_PLACES) {
  places.push({ ...floor, y: -0.05, model: 'floor_tile_large.gltf' })
  places.push({ x: floor.x, y: 4.25, z: floor.z, rotY: 0, model: 'ceiling_tile.gltf' })
}

for (const wall of WALL_PLACES) {
  const [ox, oz] = outward(wall.rotY)
  places.push({
    x: wall.x + ox * OUT,
    y: 0,
    z: wall.z + oz * OUT,
    rotY: wall.rotY,
    model: wallModel(wall.x, wall.z),
  })
  const n = Math.abs(Math.round(wall.x / 4) + Math.round(wall.z / 4) * 3)
  if (n % 5 === 0) {
    places.push({
      x: wall.x - ox * 0.02,
      y: 2.35,
      z: wall.z - oz * 0.02,
      rotY: wall.rotY,
      model: 'torch_mounted.gltf',
    })
  }
}

for (const prop of PROP_LIST) {
  places.push({ x: prop.x, y: 0, z: prop.z, rotY: prop.rotY, model: 'pillar.gltf' })
}

places.push(
  { x: 58, y: 0, z: 12, rotY: 0, model: 'stairs_wide.gltf' },
  { x: 96, y: 0, z: 108, rotY: 0, model: 'stairs_long.gltf' },
  { x: 66, y: 0, z: 26, rotY: 0.4, model: 'crates_stacked.gltf' },
  { x: 96, y: 0, z: 118, rotY: -0.6, model: 'crates_stacked.gltf' },
)

export const KAYKIT_PLACES = places

export const KAYKIT_EXTRA_WALLS: WallBox[] = [
  { cx: 58, cz: 14, hx: 3.5, hz: 2 },
  { cx: 96, cz: 112, hx: 2.5, hz: 4 },
  { cx: 66, cz: 26, hx: 1.1, hz: 1.15 },
  { cx: 96, cz: 118, hx: 1.1, hz: 1.15 },
]

export const KAYKIT_OCCLUDERS: OccBox[] = [
  { minX: 54.5, maxX: 61.5, minY: 0, maxY: 5.1, minZ: 12, maxZ: 16 },
  { minX: 93.5, maxX: 98.5, minY: 0, maxY: 5.1, minZ: 108, maxZ: 116 },
  { minX: 64.9, maxX: 67.1, minY: 0, maxY: 2.2, minZ: 24.85, maxZ: 27.15 },
  { minX: 94.9, maxX: 97.1, minY: 0, maxY: 2.2, minZ: 116.85, maxZ: 119.15 },
]
