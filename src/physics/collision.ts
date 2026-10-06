import { PLAYER_RADIUS, ROOM_BOUNDS, type FurnitureItem } from '../../shared/furniture'

type Aabb = { minX: number; maxX: number; minZ: number; maxZ: number }

function furnitureAabbs(furniture: FurnitureItem[]): Aabb[] {
  return furniture
    .filter((f) => f.collider)
    .map((f) => {
      const [hx, hz] = f.collider!
      return {
        minX: f.position[0] - hx,
        maxX: f.position[0] + hx,
        minZ: f.position[2] - hz,
        maxZ: f.position[2] + hz,
      }
    })
}

function overlaps(x: number, z: number, r: number, box: Aabb) {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX))
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ))
  const dx = x - nearestX
  const dz = z - nearestZ
  return dx * dx + dz * dz < r * r
}

/** 圓形角色 vs AABB 家具；分開測 X/Z 以便貼牆滑動 */
export function resolveMove(
  fromX: number,
  fromZ: number,
  dx: number,
  dz: number,
  furniture: FurnitureItem[],
) {
  const boxes = furnitureAabbs(furniture)
  const r = PLAYER_RADIUS

  let x = fromX + dx
  let z = fromZ

  x = Math.max(ROOM_BOUNDS.minX, Math.min(ROOM_BOUNDS.maxX, x))
  if (boxes.some((b) => overlaps(x, z, r, b))) x = fromX

  z = fromZ + dz
  z = Math.max(ROOM_BOUNDS.minZ, Math.min(ROOM_BOUNDS.maxZ, z))
  if (boxes.some((b) => overlaps(x, z, r, b))) z = fromZ

  return { x, z }
}
