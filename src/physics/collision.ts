import { isWalkableWorld } from '../../shared/dungeon'
import { canMoveTo, type HeightField } from '../../shared/heightfield'
import { samplePathClear } from '../../shared/sampleCollision'
import { KAYKIT_EXTRA_WALLS } from '../../shared/kaykitScene'
import { blocksAtHeight, type Platform } from '../../shared/platforms'
import {
  INNER_WALLS,
  PLAYER_RADIUS,
  ROOM_BOUNDS,
  type FurnitureItem,
  type WallBox,
} from '../../shared/furniture'

export type Aabb = { minX: number; maxX: number; minZ: number; maxZ: number; id?: string }

const STATIC_AABBS: Aabb[] = INNER_WALLS.map((w) => ({
  minX: w.cx - w.hx,
  maxX: w.cx + w.hx,
  minZ: w.cz - w.hz,
  maxZ: w.cz + w.hz,
  id: 'wall',
}))

export function wallToAabb(w: WallBox): Aabb {
  return {
    minX: w.cx - w.hx,
    maxX: w.cx + w.hx,
    minZ: w.cz - w.hz,
    maxZ: w.cz + w.hz,
    id: 'wall',
  }
}

export const KAYKIT_EXTRA_AABBS: Aabb[] = KAYKIT_EXTRA_WALLS.map(wallToAabb)

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

export type MoveSpace = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  walkable: (x: number, z: number, r: number) => boolean
}

function clampToRoom(x: number, z: number, hx = 0, hz = 0, bounds = ROOM_BOUNDS) {
  return {
    x: Math.max(bounds.minX + hx, Math.min(bounds.maxX - hx, x)),
    z: Math.max(bounds.minZ + hz, Math.min(bounds.maxZ - hz, z)),
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
  const walls = STATIC_AABBS
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
  radius: number,
  extra: Aabb[],
  y = 0,
  platforms: Platform[] = [],
  nav: HeightField | null = null,
  space?: MoveSpace,
): MoveResult {
  const r = radius
  let nx = fromX + dx
  let nz = fromZ + dz
  const navBounds = nav
    ? {
        minX: nav.originX,
        maxX: nav.originX + nav.cols * nav.cell,
        minZ: nav.originZ,
        maxZ: nav.originZ + nav.rows * nav.cell,
      }
    : undefined
  const clamped = clampToRoom(nx, nz, 0, 0, space ?? navBounds ?? ROOM_BOUNDS)
  nx = clamped.x
  nz = clamped.z

  if (nav) {
    if (!canMoveTo(nav, fromX, fromZ, nx, nz, r, y, y)) return { x: fromX, z: fromZ }
    if (nav.id === 'sample' && !samplePathClear(fromX, fromZ, nx, nz, r, y, y)) return { x: fromX, z: fromZ }
  } else if (space) {
    if (!space.walkable(nx, nz, r)) return { x: fromX, z: fromZ }
  } else if (!isWalkableWorld(nx, nz, r)) return { x: fromX, z: fromZ }
  // 有高度圖時地面高低由高度圖決定。平台厚塊會把樓梯踏面擋成牆，
  // 牆也已經是高度圖上的空格。額外的盒子含寶箱，會把出生點封死。
  if (!nav && blocksAtHeight(nx, nz, y, r, platforms)) return { x: fromX, z: fromZ }

  if (!nav && !space) {
    for (const w of STATIC_AABBS) {
      if (circleHitsAabb(nx, nz, r, w)) return { x: fromX, z: fromZ }
    }
  }
  if (!nav) {
    for (const w of extra) {
      if (circleHitsAabb(nx, nz, r, w)) return { x: fromX, z: fromZ }
    }
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
  radius = PLAYER_RADIUS,
  extra: Aabb[] = [],
  y = 0,
  platforms: Platform[] = [],
  nav: HeightField | null = null,
  space?: MoveSpace,
): MoveResult {
  let x = fromX
  let z = fromZ
  let pushed: MoveResult['pushed']

  if (dx !== 0) {
    const rx = tryMove(x, z, dx, 0, furniture, radius, extra, y, platforms, nav, space)
    x = rx.x
    z = rx.z
    if (rx.pushed) pushed = rx.pushed
  }
  if (dz !== 0) {
    const furn = withPushed(furniture, pushed)
    const rz = tryMove(x, z, 0, dz, furn, radius, extra, y, platforms, nav, space)
    x = rz.x
    z = rz.z
    if (rz.pushed) pushed = rz.pushed
  }

  return { x, z, pushed }
}
