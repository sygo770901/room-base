import {
  INNER_WALLS,
  PLAYER_RADIUS,
  ROOM_BOUNDS,
  type FurnitureItem,
  type WallBox,
} from '../../shared/furniture'

export type Aabb = { minX: number; maxX: number; minZ: number; maxZ: number; id?: string }

export function wallToAabb(w: WallBox): Aabb {
  return {
    minX: w.cx - w.hx,
    maxX: w.cx + w.hx,
    minZ: w.cz - w.hz,
    maxZ: w.cz + w.hz,
    id: 'wall',
  }
}

export function furnitureToAabb(f: FurnitureItem): Aabb | null {
  if (!f.collider) return null
  const [hx, hz] = f.collider
  return {
    minX: f.position[0] - hx,
    maxX: f.position[0] + hx,
    minZ: f.position[2] - hz,
    maxZ: f.position[2] + hz,
    id: f.id,
  }
}

export function circleHitsAabb(x: number, z: number, r: number, box: Aabb) {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX))
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ))
  const dx = x - nearestX
  const dz = z - nearestZ
  return dx * dx + dz * dz < r * r
}

export function aabbOverlap(a: Aabb, b: Aabb) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
}

function clampToRoom(x: number, z: number, hx = 0, hz = 0) {
  return {
    x: Math.max(ROOM_BOUNDS.minX + hx, Math.min(ROOM_BOUNDS.maxX - hx, x)),
    z: Math.max(ROOM_BOUNDS.minZ + hz, Math.min(ROOM_BOUNDS.maxZ - hz, z)),
  }
}

function withPushed(
  furniture: FurnitureItem[],
  pushed?: { id: string; x: number; z: number },
): FurnitureItem[] {
  if (!pushed) return furniture
  return furniture.map((f) =>
    f.id === pushed.id ? { ...f, position: [pushed.x, f.position[1], pushed.z] } : f,
  )
}

/** 家具放置／拖曳：不可穿牆、不可與其他可碰撞家具重疊 */
export function resolveFurniturePlace(
  furniture: FurnitureItem[],
  moving: FurnitureItem,
  nextX: number,
  nextZ: number,
): { x: number; z: number; ok: boolean } {
  if (!moving.collider) {
    const c = clampToRoom(nextX, nextZ)
    return { ...c, ok: true }
  }
  const [hx, hz] = moving.collider
  const c = clampToRoom(nextX, nextZ, hx, hz)
  const candidate: Aabb = {
    minX: c.x - hx,
    maxX: c.x + hx,
    minZ: c.z - hz,
    maxZ: c.z + hz,
    id: moving.id,
  }
  const walls = INNER_WALLS.map(wallToAabb)
  const others = furniture
    .filter((f) => f.id !== moving.id)
    .map(furnitureToAabb)
    .filter((b): b is Aabb => !!b)
  if ([...walls, ...others].some((b) => aabbOverlap(candidate, b))) {
    return { x: moving.position[0], z: moving.position[2], ok: false }
  }
  return { x: c.x, z: c.z, ok: true }
}

export type MoveResult = {
  x: number
  z: number
  pushed?: { id: string; x: number; z: number }
}

function tryMove(
  fromX: number,
  fromZ: number,
  dx: number,
  dz: number,
  furniture: FurnitureItem[],
): MoveResult {
  const r = PLAYER_RADIUS
  let nx = fromX + dx
  let nz = fromZ + dz
  const clamped = clampToRoom(nx, nz)
  nx = clamped.x
  nz = clamped.z

  for (const w of INNER_WALLS.map(wallToAabb)) {
    if (circleHitsAabb(nx, nz, r, w)) return { x: fromX, z: fromZ }
  }

  for (const f of furniture) {
    const box = furnitureToAabb(f)
    if (!box || !circleHitsAabb(nx, nz, r, box)) continue

    if (f.pushable && f.draggable) {
      const pushScale = 0.6
      const placed = resolveFurniturePlace(
        furniture,
        f,
        f.position[0] + dx * pushScale,
        f.position[2] + dz * pushScale,
      )
      if (placed.ok && (placed.x !== f.position[0] || placed.z !== f.position[2])) {
        return { x: nx, z: nz, pushed: { id: f.id, x: placed.x, z: placed.z } }
      }
    }
    return { x: fromX, z: fromZ }
  }

  return { x: nx, z: nz }
}

/** 角色移動：分軸滑動；撞到可推動家具會微微挪開 */
export function resolvePlayerMove(
  fromX: number,
  fromZ: number,
  dx: number,
  dz: number,
  furniture: FurnitureItem[],
): MoveResult {
  let x = fromX
  let z = fromZ
  let pushed: MoveResult['pushed']

  if (dx !== 0) {
    const rx = tryMove(x, z, dx, 0, furniture)
    x = rx.x
    z = rx.z
    if (rx.pushed) pushed = rx.pushed
  }
  if (dz !== 0) {
    const furn = withPushed(furniture, pushed)
    const rz = tryMove(x, z, 0, dz, furn)
    x = rz.x
    z = rz.z
    if (rz.pushed) pushed = rz.pushed
  }

  return { x, z, pushed }
}
