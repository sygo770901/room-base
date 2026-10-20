/** 門規則與數值（先定，昱豪可改）。位置改放各地圖資料，不要在這裡寫死座標。 */
export const DOOR_RANGE = 1.5
export const DOOR_PROMPT_RANGE = 2
export const DOOR_AUTO_RANGE = 1.5
export const DOOR_AUTO_CLOSE_MS = 3000
export const DOOR_CLIENT_SLACK = 4
export const DOOR_ANIM_MS = 400
export const DOOR_MONSTER_WAIT_MS = 1000
export const DOOR_WIDTH = 2.6
export const DOOR_THICK = 0.28

export interface DoorDef {
  id: string
  x: number
  z: number
  /** 0：門板沿 X（擋南北）；π/2：門板沿 Z（擋東西） */
  rotY: number
}

export interface DoorState {
  id: string
  open: boolean
  busyUntil: number
}

export function createDoors(defs: DoorDef[]): DoorState[] {
  return defs.map((d) => ({ id: d.id, open: false, busyUntil: 0 }))
}

export function doorDef(id: string, defs: DoorDef[]) {
  return defs.find((d) => d.id === id)
}

export function doorBox(def: DoorDef) {
  const alongX = Math.abs(Math.cos(def.rotY)) > 0.5
  const hx = alongX ? DOOR_WIDTH / 2 : DOOR_THICK / 2
  const hz = alongX ? DOOR_THICK / 2 : DOOR_WIDTH / 2
  return { cx: def.x, cz: def.z, hx, hz }
}

export function closedDoorWalls(doors: DoorState[] | undefined, defs: DoorDef[], now = Date.now()) {
  const out: { cx: number; cz: number; hx: number; hz: number }[] = []
  if (!doors) return out
  for (const d of doors) {
    if (d.open) continue
    const def = doorDef(d.id, defs)
    if (!def) continue
    out.push(doorBox(def))
  }
  return out
}

export function closedDoorAabbs(doors: DoorState[] | undefined, defs: DoorDef[], now = Date.now()) {
  return closedDoorWalls(doors, defs, now).map((w) => ({
    minX: w.cx - w.hx,
    maxX: w.cx + w.hx,
    minZ: w.cz - w.hz,
    maxZ: w.cz + w.hz,
    id: 'door',
  }))
}

export function occupantInDoor(def: DoorDef, x: number, z: number, r = 0.3) {
  const b = doorBox(def)
  const pad = 0.35
  return Math.abs(x - b.cx) <= b.hx + pad + r && Math.abs(z - b.cz) <= b.hz + pad + r
}

/** 只拿來判斷距離，不可以改玩家座標。 */
export function doorToggleAim(
  lastX: number,
  lastZ: number,
  payload: { id?: string; x?: number; z?: number },
  defs: DoorDef[],
  range = DOOR_RANGE,
) {
  let px = lastX
  let pz = lastZ
  if (typeof payload.x === 'number' && typeof payload.z === 'number' && Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
    if (Math.hypot(payload.x - lastX, payload.z - lastZ) <= DOOR_CLIENT_SLACK) {
      px = payload.x
      pz = payload.z
    }
  }
  const hinted = typeof payload.id === 'string' ? doorDef(payload.id, defs) : undefined
  const near = hinted && Math.hypot(hinted.x - px, hinted.z - pz) <= range ? hinted : nearestDoor(px, pz, defs, range)
  return { x: px, z: pz, door: near ?? null }
}

export function toggleDoorOpen(doors: DoorState[], id: string, now = Date.now()) {
  const door = doors.find((d) => d.id === id)
  if (!door || now < door.busyUntil) return null
  door.open = !door.open
  door.busyUntil = now + DOOR_ANIM_MS
  return door
}

export function nearestDoor(x: number, z: number, defs: DoorDef[], range = DOOR_RANGE) {
  let best: DoorDef | null = null
  let bestD = range
  for (const d of defs) {
    const dist = Math.hypot(d.x - x, d.z - z)
    if (dist <= bestD) {
      best = d
      bestD = dist
    }
  }
  return best
}

function segHitsBox(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  b: { cx: number; cz: number; hx: number; hz: number },
) {
  const minX = b.cx - b.hx
  const maxX = b.cx + b.hx
  const minZ = b.cz - b.hz
  const maxZ = b.cz + b.hz
  const dx = x1 - x0
  const dz = z1 - z0
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 0.25))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + dx * t
    const z = z0 + dz * t
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true
  }
  return false
}

export function doorHidesFrom(
  doors: DoorState[] | undefined,
  from: { x: number; z: number },
  to: { x: number; z: number },
  defs: DoorDef[],
  now = Date.now(),
) {
  for (const w of closedDoorWalls(doors, defs, now)) {
    if (segHitsBox(from.x, from.z, to.x, to.z, w)) return true
  }
  return false
}

export function doorOnPath(
  doors: DoorState[] | undefined,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  defs: DoorDef[],
  now = Date.now(),
) {
  for (const d of doors ?? []) {
    if (d.open) continue
    const def = doorDef(d.id, defs)
    if (!def) continue
    if (segHitsBox(x0, z0, x1, z1, doorBox(def))) return d
  }
  return null
}
