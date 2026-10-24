import type { Server } from 'socket.io'
import { activeLock, attackCombat, combatFacingPayload, combatYaw, type CombatLock } from '../shared/facing.ts'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  ATTACK_RANGE,
  meleeHits,
  type DamageRank,
  BARB_DAMAGE,
  BARB_SPEED,
  BARB_TELEGRAPH_R,
  BARB_WINDUP_MS,
  BOSS_COUNTDOWN_MS,
  BOSS_SIGHT,
  duckKingHp,
  dispenserHp,
  DUCK_CHAT_LINES,
  DUCK_MAX_DISPENSERS,
  DUCK_SPEECH_GAP_MS,
  DUCK_SPEECH_HOLD_MS,
  DUCK_SPEECH_RANGE,
  DUCK_SUMMON_INTERVAL_MS,
  DUCK_SUMMON_SHOUT,
  CHASE_SPEED,
  FLEE_SPEED,
  FLEE_SPEED_RAGE,
  RAGE_PAUSE_MS,
  SLAM_CD_MS,
  SLAM_CD_RAGE_MS,
  SLAM_DAMAGE,
  SLAM_RADIUS,
  SLAM_RADIUS_RAGE,
  SLAM_RANGE,
  SLAM_WINDUP_MS,
  SLAM_WINDUP_RAGE_MS,
  PET_SKILL_CD_RAGE_MS,
  IFRAME_MS,
  KNIGHT_DAMAGE,
  KNIGHT_SPEED,
  MAGE_CAST_CD_MS,
  MAGE_KEEP_MAX,
  MAGE_KEEP_MIN,
  MAGE_ORB_DAMAGE,
  MAGE_ORB_RADIUS,
  MAGE_ORB_SPEED,
  MAGE_ORB_TTL_MS,
  MAGE_WINDUP_MS,
  MONSTER_HIT_CD,
  MONSTER_TOUCH,
  PATROL_SPEED,
  PET_DAMAGE,
  PET_FOLLOW_SPEED,
  PET_POUNCE_MS,
  PET_POUNCE_SPEED,
  PET_SKILL_CD_MS,
  PLAYER_HURT_IFRAME_MS,
  PLAYER_MAX_HP,
  RESPAWN_MS,
  ROGUE_DAMAGE,
  ROGUE_RETREAT_MS,
  ROGUE_SPEED,
  SIGHT,
  KNIGHT_HP,
  monsterRadius,
  type DuckSpeech,
  type MatchOver,
  type MonsterKind,
  type MonsterState,
  type ProjectileState,
} from '../shared/combat.ts'
import { doorsOf, extraAabbsOf, extraWallsOf, spawnPointsOf } from '../shared/mapData.ts'
import { clampDispenserStep, placeDispensers } from '../shared/dispensers.ts'
import { groundY } from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import {
  BOSS_DEFS,
  FLOOR_CENTERS,
  MONSTER_DEFS,
  hasLineOfSight,
  isWalkableWorld,
  type MonsterDef,
} from '../shared/dungeon.ts'
import type { GameMode } from '../shared/modes.ts'
import {
  BARREL_HP,
  BARREL_RADIUS,
  BARREL_RESPAWN_MS,
  DROP_TTL_MS,
  HEAL_POTION,
  PICKUP_RANGE,
  WEAPON_STATS,
  WEAPON_TTL_MS,
  rollDrop,
  type BarrelState,
  type LootDrop,
} from '../shared/barrels.ts'
import { inSmoke, publishSmokes, type RoomSticks, type SmokeCloud } from '../shared/smoke.ts'
import { nextComboStep, type HitAnim } from '../shared/anim.ts'
import {
  DOOR_MONSTER_WAIT_MS,
  closedDoorAabbs,
  closedDoorWalls,
  doorOnPath,
  type DoorState,
} from '../shared/doors.ts'
import type { TagState } from '../shared/tag.ts'
import { handleTagAttack, recordMoveOrigin, tickTag, type MoveBank } from './tag.ts'
import { computeAwards } from '../shared/awards.ts'
import { CORPSE_MS, DOWNED_MS, DOWNED_SOLO_MS, MATCH_WIN_DELAY_MS, RESCUE_HP, isDowned, respawnChoiceReady } from '../shared/downed.ts'
import { announce } from './feed.ts'
import type { PlayerState } from './types.ts'

export interface ServerMonster {
  id: string
  name: string
  model: MonsterDef['model']
  kind: MonsterKind
  maxHp: number
  hp: number
  x: number
  z: number
  y?: number
  rotationY: number
  alive: boolean
  patrol: { x: number; z: number }[]
  patrolI: number
  nextHit: number
  respawnAt: number
  lastHitBy: string | null
  wander: { x: number; z: number }
  pounceUntil: number
  nextSkill: number
  pounceTargetId: string | null
  spawnedAt: number
  windupUntil: number
  nextSlam: number
  slamResolved: boolean
  slamRadius: number
  phase: 1 | 2
  invulnUntil: number
  retreatUntil: number
  castUntil: number
  nextCast: number
  windupX: number
  windupZ: number
  doorWaitUntil: number
  waitingDoorId: string | null
  diedAt: number
}

export interface CombatRoom {
  roomId: string
  scene?: import('../shared/scenes.ts').SceneId
  mode?: GameMode
  players: Record<string, PlayerState>
  monsters: ServerMonster[]
  hurtUntil: Record<string, number>
  nextAttack: Record<string, number>
  matchOver?: MatchOver | null
  awayUntil?: Record<string, number>
  damage?: Record<string, { name: string; dmg: number }>
  settings?: { timed: boolean; timeLimitSec: 0 | 300 }
  matchDeadline?: number | null
  startAt?: number
  hpScaled?: boolean
  started?: boolean
  tag?: TagState
  lastMoveAt?: Record<string, number>
  moveBank?: Record<string, MoveBank>
  moveGrant?: Record<string, { dashUntil?: number; jumpUntil?: number; sprintHoldStart?: number; sprintHoldEnd?: number }>
  combatLock?: Record<string, CombatLock>
  smokes?: SmokeCloud[]
  poopSticks?: RoomSticks
  barrels?: BarrelState[]
  drops?: LootDrop[]
  projectiles?: ProjectileState[]
  comboStep?: Record<string, number>
  lastSwingAt?: Record<string, number>
  doors?: DoorState[]
  nextSummonAt?: number
  duckSpeech?: DuckSpeech | null
  lastDuckLine?: string
  speechNextAt?: number
  taken?: Record<string, number>
  dispenserKills?: Record<string, number>
  rescues?: Record<string, number>
  hideMs?: Record<string, number>
  feed?: import('../shared/events.ts').FeedItem[]
  pendingWinAt?: number
}

function fromDef(d: MonsterDef): ServerMonster {
  const kind: MonsterKind = d.kind ?? 'grunt'
  return {
    id: d.id,
    name: d.name,
    model: d.model,
    kind,
    maxHp: d.maxHp,
    hp: d.maxHp,
    x: d.patrol[0]?.x ?? FLOOR_CENTERS[0]?.x ?? 80,
    z: d.patrol[0]?.z ?? FLOOR_CENTERS[0]?.z ?? 22,
    rotationY: 0,
    alive: true,
    diedAt: 0,
    patrol: d.patrol,
    patrolI: 0,
    nextHit: 0,
    respawnAt: 0,
    lastHitBy: null,
    wander: { x: d.patrol[0]?.x ?? 80, z: d.patrol[0]?.z ?? 22 },
    pounceUntil: 0,
    nextSkill: Date.now() + 4500,
    pounceTargetId: null,
    spawnedAt: Date.now(),
    windupUntil: 0,
    nextSlam: 0,
    slamResolved: true,
    slamRadius: SLAM_RADIUS,
    phase: 1,
    invulnUntil: 0,
    retreatUntil: 0,
    castUntil: 0,
    nextCast: 0,
    windupX: 0,
    windupZ: 0,
    doorWaitUntil: 0,
    waitingDoorId: null,
  }
}

export function createMonsters(scene?: string | null): ServerMonster[] {
  const field = heightFieldOf(scene)
  if (field) {
    if (field.patrol.length >= 2) {
      const made = fromDef({
        id: 'knight',
        name: '騎士',
        model: 'knight',
        maxHp: KNIGHT_HP,
        patrol: field.patrol,
      })
      const gy = groundY(field, made.x, made.z)
      if (gy != null) made.y = gy
      return [made]
    }
    return []
  }
  return MONSTER_DEFS.map(fromDef)
}

export function createBossMonsters(scene?: string | null): ServerMonster[] {
  const monsters = BOSS_DEFS.map(fromDef)
  const duck = monsters.find((m) => m.kind === 'duck-king')
  const pets = monsters.filter((m) => m.kind === 'dispenser')
  if (!duck || pets.length === 0) return monsters
  const spots = placeDispensers(
    scene ?? 'kenney',
    pets.length,
    1,
    { x: duck.x, z: duck.z },
    [{ x: duck.x, z: duck.z }],
  )
  pets.forEach((pet, i) => {
    const spot = spots[i]
    if (!spot) return
    pet.x = spot.x
    pet.z = spot.z
    pet.patrol = [
      { x: spot.x, z: spot.z },
      { x: duck.x, z: duck.z },
    ]
    pet.wander = { x: duck.x, z: duck.z }
    const field = heightFieldOf(scene)
    const gy = field ? groundY(field, spot.x, spot.z) : null
    if (gy != null) pet.y = gy
  })
  return monsters
}

export function publicMonsters(list: ServerMonster[]): MonsterState[] {
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    model: m.model,
    kind: m.kind,
    x: m.x,
    z: m.z,
    ...(typeof m.y === 'number' ? { y: m.y } : {}),
    rotationY: m.rotationY,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.alive,
    diedAt: m.diedAt || undefined,
    pouncing: m.kind === 'dispenser' && m.pounceUntil > Date.now(),
    phase: m.kind === 'duck-king' ? m.phase : undefined,
    casting: m.model === 'mage' && m.castUntil > Date.now(),
  }))
}

function pickWander(fromX: number, fromZ: number, minDist = 10): { x: number; z: number } {
  const pool = FLOOR_CENTERS.length ? FLOOR_CENTERS : [{ x: fromX + 4, z: fromZ }]
  let best = pool[Math.floor(Math.random() * pool.length)]
  for (let i = 0; i < 8; i++) {
    const c = pool[Math.floor(Math.random() * pool.length)]
    if (Math.hypot(c.x - fromX, c.z - fromZ) >= minDist) return c
    best = c
  }
  return best
}

function nearestVisible(
  room: CombatRoom,
  mx: number,
  mz: number,
  extraWalls: { cx: number; cz: number; hx: number; hz: number }[],
  sight: number,
) {
  let target: PlayerState | null = null
  let best = sight
  for (const p of Object.values(room.players)) {
    if (p.hidden) continue
    if (p.team === 'spectator') continue
    if (room.awayUntil?.[p.id]) continue
    if (isDowned(p)) continue
    if (inSmoke(room.smokes, p.position[0], p.position[2], Date.now())) continue
    const d = Math.hypot(p.position[0] - mx, p.position[2] - mz)
    if (d > sight || d >= best) continue
    const field = heightFieldOf(room.scene)
    const my = field ? (groundY(field, mx, mz) ?? 0) : 0
    if (!hasLineOfSight(mx, mz, p.position[0], p.position[2], extraWalls, field, my, p.position[1] ?? 0)) continue
    best = d
    target = p
  }
  return { target, dist: best }
}

function stepMonster(
  room: CombatRoom,
  m: ServerMonster,
  tx: number,
  tz: number,
  speed: number,
  dt: number,
  extraAabbs: { minX: number; maxX: number; minZ: number; maxZ: number }[],
) {
  const r = monsterRadius(m.kind)
  const dx = tx - m.x
  const dz = tz - m.z
  const len = Math.hypot(dx, dz) || 1
  const step = Math.min(speed * dt, len)
  const mx = (dx / len) * step
  const mz = (dz / len) * step
  const beforeX = m.x
  const beforeZ = m.z
  const nav = heightFieldOf(room.scene)
  const moved = resolvePlayerMove(m.x, m.z, mx, mz, [], r, extraAabbs, 0, [], nav)
  m.x = moved.x
  m.z = moved.z
  if (nav) {
    const gy = groundY(nav, m.x, m.z)
    if (gy != null) m.y = gy
  }
  if (Math.abs(m.x - beforeX) > 0.001 || Math.abs(m.z - beforeZ) > 0.001) {
    m.rotationY = Math.atan2(m.x - beforeX, m.z - beforeZ)
  }
  return { moved: Math.hypot(m.x - beforeX, m.z - beforeZ), remain: Math.hypot(tx - m.x, tz - m.z) }
}

/** 測試與高度圖用：同一套步進，不帶地城門。 */
export function stepMonsterToward(
  scene: string | null | undefined,
  m: { x: number; z: number; rotationY: number; kind?: MonsterKind; y?: number },
  tx: number,
  tz: number,
  speed: number,
  dt: number,
) {
  const nav = heightFieldOf(scene)
  const r = monsterRadius(m.kind)
  const dx = tx - m.x
  const dz = tz - m.z
  const len = Math.hypot(dx, dz) || 1
  const step = Math.min(speed * dt, len)
  const beforeX = m.x
  const beforeZ = m.z
  const moved = resolvePlayerMove(m.x, m.z, (dx / len) * step, (dz / len) * step, [], r, [], 0, [], nav)
  m.x = moved.x
  m.z = moved.z
  if (Math.abs(m.x - beforeX) > 0.001 || Math.abs(m.z - beforeZ) > 0.001) {
    m.rotationY = Math.atan2(m.x - beforeX, m.z - beforeZ)
  }
  if (nav) {
    const gy = groundY(nav, m.x, m.z)
    if (gy != null) m.y = gy
  }
  return { moved: Math.hypot(m.x - beforeX, m.z - beforeZ), remain: Math.hypot(tx - m.x, tz - m.z), y: m.y ?? 0 }
}

function bossAwards(room: CombatRoom) {
  return computeAwards({
    mode: room.mode,
    names: Object.fromEntries(Object.values(room.players).map((p) => [p.id, p.name])),
    damage: Object.fromEntries(Object.entries(room.damage ?? {}).map(([id, v]) => [id, v.dmg])),
    taken: room.taken,
    dispenserKills: room.dispenserKills,
    rescues: room.rescues,
  })
}

export function respawnPlayer(room: CombatRoom, io: Server, player: PlayerState, now: number, reason?: string) {
  const spawns = spawnPointsOf(room.scene)
  const sp = spawnOf(room.scene, Math.floor(Math.random() * spawns.length))
  player.hp = PLAYER_MAX_HP
  player.downedUntil = 0
  player.downedAt = 0
  player.position = [sp.x, sp.y, sp.z]
  player.seated = null
  room.hurtUntil[player.id] = now + IFRAME_MS
  recordMoveOrigin(room, player.id, now)
  if (room.moveGrant) delete room.moveGrant[player.id]
  io.to(player.id).emit('player:respawn', {
    position: player.position,
    hp: player.hp,
    rotationY: player.rotationY,
    reason,
  })
  io.to(room.roomId).emit('player:moved', {
    id: player.id,
    position: player.position,
    rotationY: player.rotationY,
    snap: true,
  })
  io.to(room.roomId).emit('player:vitals', { id: player.id, hp: player.hp, downedUntil: 0, downedAt: 0 })
}

/** 倒地玩家自己要求回出生點。5 秒前拒絕；滿 15 秒不再走這條，交給 tickDowned。 */
export function requestSpawnRespawn(room: CombatRoom, io: Server, player: PlayerState, now: number) {
  if (room.matchOver) return false
  if ((player.hp ?? 0) > 0) return false
  if (!respawnChoiceReady(player, now)) return false
  respawnPlayer(room, io, player, now, 'spawn')
  return true
}

export function standPlayer(room: CombatRoom, io: Server, player: PlayerState, now: number) {
  player.hp = RESCUE_HP
  player.downedUntil = 0
  player.downedAt = 0
  room.hurtUntil[player.id] = now + IFRAME_MS
  io.to(room.roomId).emit('player:vitals', { id: player.id, hp: player.hp, downedUntil: 0, downedAt: 0 })
}

function wipeIfAllDowned(room: CombatRoom, io: Server, now: number) {
  const live = Object.values(room.players).filter((p) => !room.awayUntil?.[p.id] && p.team !== 'spectator')
  // 單人沒有隊友可扶，不把 15 秒收成 3 秒。
  if (live.length < 2 || !live.every((p) => isDowned(p, now) || p.hp <= 0)) return
  for (const p of live) {
    p.downedUntil = Math.min(p.downedUntil || now + DOWNED_SOLO_MS, now + DOWNED_SOLO_MS)
    io.to(room.roomId).emit('player:vitals', { id: p.id, hp: p.hp, downedUntil: p.downedUntil, downedAt: p.downedAt ?? 0 })
  }
}

export function tickDowned(room: CombatRoom, io: Server, now: number) {
  if (room.matchOver) return
  for (const p of Object.values(room.players)) {
    if (p.downedUntil && now >= p.downedUntil && p.hp <= 0) respawnPlayer(room, io, p, now)
  }
}

export function hurtPlayer(room: CombatRoom, io: Server, player: PlayerState, dmg: number, now: number) {
  if (now < (room.hurtUntil[player.id] ?? 0)) return
  if (isDowned(player, now)) return
  const x = player.position[0]
  const z = player.position[2]
  const lethal = (player.hp ?? PLAYER_MAX_HP) - dmg <= 0
  const hitAnim: HitAnim = lethal ? 'death' : Math.random() < 0.5 ? 'A' : 'B'
  player.hp = Math.max(0, (player.hp ?? PLAYER_MAX_HP) - dmg)
  if (!room.taken) room.taken = {}
  room.taken[player.id] = (room.taken[player.id] ?? 0) + dmg
  io.to(room.roomId).emit('combat:hit', {
    id: player.id,
    kind: 'player',
    amount: dmg,
    x,
    z,
    by: null,
    hitAnim,
  })
  if (player.hp <= 0) {
    player.hp = 0
    const mates = Object.values(room.players).filter(
      (p) => p.id !== player.id && !room.awayUntil?.[p.id] && p.team !== 'spectator' && p.hp > 0 && !isDowned(p, now),
    )
    const canRescue = room.mode === 'boss' && room.started && !room.matchOver && mates.length > 0
    const alone =
      Object.values(room.players).filter((p) => !room.awayUntil?.[p.id] && p.team !== 'spectator').length < 2
    player.downedAt = now
    player.downedUntil = now + (canRescue || alone ? DOWNED_MS : DOWNED_SOLO_MS)
    room.hurtUntil[player.id] = now + PLAYER_HURT_IFRAME_MS
    io.to(room.roomId).emit('player:vitals', { id: player.id, hp: 0, downedUntil: player.downedUntil, downedAt: player.downedAt })
    wipeIfAllDowned(room, io, now)
  } else {
    room.hurtUntil[player.id] = now + PLAYER_HURT_IFRAME_MS
  }
  io.to(room.roomId).emit('player:vitals', {
    id: player.id,
    hp: player.hp,
    downedUntil: player.downedUntil ?? 0,
    downedAt: player.downedAt ?? 0,
  })
}

function tryTouch(
  room: CombatRoom,
  io: Server,
  m: ServerMonster,
  target: PlayerState,
  now: number,
  dist: number,
  dmg: number,
) {
  const touch = MONSTER_TOUCH + (m.kind === 'dispenser' ? 0.25 : 0)
  const canHit = meleeHits(m.x, m.z, m.rotationY, target.position[0], target.position[2], touch)
  if (canHit && now >= m.nextHit && now >= (room.hurtUntil[target.id] ?? 0)) {
    m.nextHit = now + MONSTER_HIT_CD
    hurtPlayer(room, io, target, dmg, now)
    return true
  }
  return false
}

type ExtraAabb = { minX: number; maxX: number; minZ: number; maxZ: number }
type ExtraWall = { cx: number; cz: number; hx: number; hz: number }

function patrolToward(
  room: CombatRoom,
  m: ServerMonster,
  seen: { target: PlayerState | null; dist: number },
  speed: number,
  dt: number,
  extraAabbs: ExtraAabb[],
) {
  const wp = m.patrol[m.patrolI]
  let tx = wp.x
  let tz = wp.z
  let use = PATROL_SPEED
  if (seen.target) {
    tx = seen.target.position[0]
    tz = seen.target.position[2]
    use = speed
  }
  const { moved, remain } = stepMonster(room, m, tx, tz, use, dt, extraAabbs)
  if (!seen.target && (remain < 0.85 || moved < 0.02)) {
    m.patrolI = (m.patrolI + 1) % m.patrol.length
  }
}

function tickKnight(
  room: CombatRoom,
  io: Server,
  m: ServerMonster,
  now: number,
  dt: number,
  extraWalls: ExtraWall[],
  extraAabbs: ExtraAabb[],
) {
  const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
  if (seen.target) tryTouch(room, io, m, seen.target, now, seen.dist, KNIGHT_DAMAGE)
  patrolToward(room, m, seen, KNIGHT_SPEED, dt, extraAabbs)
}

function tickRogue(
  room: CombatRoom,
  io: Server,
  m: ServerMonster,
  now: number,
  dt: number,
  extraWalls: ExtraWall[],
  extraAabbs: ExtraAabb[],
) {
  const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
  if (now < m.retreatUntil) {
    const from = seen.target
    const dx = from ? m.x - from.position[0] : Math.sin(m.rotationY)
    const dz = from ? m.z - from.position[2] : Math.cos(m.rotationY)
    const len = Math.hypot(dx, dz) || 1
    stepMonster(room, m, m.x + (dx / len) * 6, m.z + (dz / len) * 6, ROGUE_SPEED, dt, extraAabbs)
    return
  }
  if (seen.target && tryTouch(room, io, m, seen.target, now, seen.dist, ROGUE_DAMAGE)) {
    m.retreatUntil = now + ROGUE_RETREAT_MS
    return
  }
  patrolToward(room, m, seen, ROGUE_SPEED, dt, extraAabbs)
}

function tickBarbarian(
  room: CombatRoom,
  io: Server,
  m: ServerMonster,
  now: number,
  dt: number,
  extraWalls: ExtraWall[],
  extraAabbs: ExtraAabb[],
) {
  if (m.windupUntil && !m.slamResolved && now >= m.windupUntil) {
    m.slamResolved = true
    m.nextHit = now + MONSTER_HIT_CD
    for (const p of Object.values(room.players)) {
      if (p.hidden || p.team === 'spectator' || room.awayUntil?.[p.id]) continue
      const dist = Math.hypot(p.position[0] - m.windupX, p.position[2] - m.windupZ)
      if (dist <= m.slamRadius) hurtPlayer(room, io, p, BARB_DAMAGE, now)
    }
  }
  const winding = Boolean(m.windupUntil) && now < m.windupUntil && !m.slamResolved
  if (winding) return
  const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
  if (seen.target && seen.dist <= MONSTER_TOUCH + 0.35 && now >= m.nextHit) {
    m.windupUntil = now + BARB_WINDUP_MS
    m.slamResolved = false
    m.windupX = m.x
    m.windupZ = m.z
    m.slamRadius = BARB_TELEGRAPH_R
    io.to(room.roomId).emit('mob:telegraph', {
      id: m.id,
      x: m.x,
      z: m.z,
      r: BARB_TELEGRAPH_R,
      ms: BARB_WINDUP_MS,
    })
    return
  }
  patrolToward(room, m, seen, BARB_SPEED, dt, extraAabbs)
}

function fireMageOrb(room: CombatRoom, m: ServerMonster, target: PlayerState, now: number) {
  const dx = target.position[0] - m.x
  const dz = target.position[2] - m.z
  const len = Math.hypot(dx, dz) || 1
  if (!room.projectiles) room.projectiles = []
  room.projectiles.push({
    id: `orb-${m.id}-${now}`,
    x: m.x,
    z: m.z,
    vx: (dx / len) * MAGE_ORB_SPEED,
    vz: (dz / len) * MAGE_ORB_SPEED,
    until: now + MAGE_ORB_TTL_MS,
  })
}

function tickMage(
  room: CombatRoom,
  io: Server,
  m: ServerMonster,
  now: number,
  dt: number,
  extraWalls: ExtraWall[],
  extraAabbs: ExtraAabb[],
) {
  const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
  if (m.castUntil && now >= m.castUntil) {
    if (seen.target) fireMageOrb(room, m, seen.target, now)
    m.castUntil = 0
  }
  if (seen.target) {
    const d = seen.dist
    const dx = m.x - seen.target.position[0]
    const dz = m.z - seen.target.position[2]
    const len = Math.hypot(dx, dz) || 1
    if (d < MAGE_KEEP_MIN) {
      stepMonster(room, m, m.x + (dx / len) * 4, m.z + (dz / len) * 4, KNIGHT_SPEED, dt, extraAabbs)
    } else if (d > MAGE_KEEP_MAX) {
      stepMonster(room, m, seen.target.position[0], seen.target.position[2], KNIGHT_SPEED, dt, extraAabbs)
    } else {
      m.rotationY = Math.atan2(seen.target.position[0] - m.x, seen.target.position[2] - m.z)
    }
    if (!m.castUntil && now >= m.nextCast) {
      m.castUntil = now + MAGE_WINDUP_MS
      m.nextCast = now + MAGE_CAST_CD_MS
    }
    return
  }
  patrolToward(room, m, seen, PATROL_SPEED, dt, extraAabbs)
}

function pointBlocked(x: number, z: number, extraAabbs: ExtraAabb[], scene?: string | null) {
  const field = heightFieldOf(scene)
  if (field) {
    if (groundY(field, x, z) == null) return true
  } else if (!isWalkableWorld(x, z, 0.12)) return true
  for (const b of extraAabbs) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true
  }
  return false
}

function tickProjectiles(room: CombatRoom, io: Server, now: number, dt: number, extraAabbs: ExtraAabb[]) {
  const list = room.projectiles
  if (!list?.length) return
  const hitR = MAGE_ORB_RADIUS + 0.26
  const keep: ProjectileState[] = []
  for (const orb of list) {
    if (now >= orb.until) continue
    const steps = Math.max(1, Math.ceil((MAGE_ORB_SPEED * dt) / 0.22))
    const stepDt = dt / steps
    let dead = false
    for (let i = 0; i < steps; i++) {
      orb.x += orb.vx * stepDt
      orb.z += orb.vz * stepDt
      if (pointBlocked(orb.x, orb.z, extraAabbs, room.scene)) {
        dead = true
        break
      }
      for (const p of Object.values(room.players)) {
        if (p.hidden || p.team === 'spectator' || room.awayUntil?.[p.id]) continue
        if (Math.hypot(p.position[0] - orb.x, p.position[2] - orb.z) > hitR) continue
        hurtPlayer(room, io, p, MAGE_ORB_DAMAGE, now)
        dead = true
        break
      }
      if (dead) break
    }
    if (!dead) keep.push(orb)
  }
  room.projectiles = keep
}

function sceneWalls(room: CombatRoom, now: number) {
  return extraWallsOf(room.scene).concat(closedDoorWalls(room.doors, doorsOf(room.scene), now))
}

function sceneAabbs(room: CombatRoom, now: number) {
  return extraAabbsOf(room.scene).concat(closedDoorAabbs(room.doors, doorsOf(room.scene), now))
}

function maybeMonsterOpenDoor(room: CombatRoom, io: Server, m: ServerMonster, tx: number, tz: number, now: number) {
  const blocked = doorOnPath(room.doors, m.x, m.z, tx, tz, doorsOf(room.scene), now)
  if (!blocked) {
    m.waitingDoorId = null
    m.doorWaitUntil = 0
    return
  }
  if (m.waitingDoorId !== blocked.id) {
    m.waitingDoorId = blocked.id
    m.doorWaitUntil = now + DOOR_MONSTER_WAIT_MS
    return
  }
  if (now < m.doorWaitUntil) return
  blocked.open = true
  blocked.busyUntil = now
  m.waitingDoorId = null
  io.to(room.roomId).emit('doors:sync', room.doors)
}

function tickHunt(room: CombatRoom, io: Server, now: number, dt: number) {
  const extraWalls = sceneWalls(room, now)
  const extraAabbs = sceneAabbs(room, now)
  for (const m of room.monsters) {
    if (!m.alive) {
      if (now >= m.respawnAt) {
        const p = m.patrol[0]
        m.alive = true
        m.hp = m.maxHp
        m.x = p.x
        m.z = p.z
        m.patrolI = 0
        m.castUntil = 0
        m.retreatUntil = 0
        m.windupUntil = 0
        m.slamResolved = true
      }
      continue
    }
    if (m.model === 'mage') tickMage(room, io, m, now, dt, extraWalls, extraAabbs)
    else if (m.model === 'rogue') tickRogue(room, io, m, now, dt, extraWalls, extraAabbs)
    else if (m.model === 'barbarian') tickBarbarian(room, io, m, now, dt, extraWalls, extraAabbs)
    else tickKnight(room, io, m, now, dt, extraWalls, extraAabbs)
    const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
    if (seen.target) maybeMonsterOpenDoor(room, io, m, seen.target.position[0], seen.target.position[2], now)
  }
  tickProjectiles(room, io, now, dt, extraAabbs)
}

export function scaleBossHealth(room: CombatRoom) {
  if (room.hpScaled) return
  room.hpScaled = true
  const n =
    Object.values(room.players).filter((p) => !room.awayUntil?.[p.id] && p.team !== 'spectator').length || 1
  const duckHp = duckKingHp(n)
  const petHp = dispenserHp(n)
  for (const m of room.monsters) {
    if (m.kind === 'duck-king') {
      m.maxHp = duckHp
      m.hp = duckHp
    }
    if (m.kind === 'dispenser') {
      m.maxHp = petHp
      m.hp = petHp
    }
  }
}

function maybeRage(room: CombatRoom, io: Server, now: number) {
  const duck = room.monsters.find((m) => m.kind === 'duck-king')
  if (!duck?.alive || duck.phase === 2) return
  if (duck.hp > duck.maxHp * 0.5) return
  duck.phase = 2
  duck.invulnUntil = now + RAGE_PAUSE_MS
  duck.slamResolved = true
  duck.windupUntil = 0
  io.to(room.roomId).emit('boss:phase', { phase: 2 })
  io.to(room.roomId).emit('combat:skill', { text: '鴨大王生氣了！' })
  announce(room, io, '鴨大王生氣了！')
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}

function livingCount(room: CombatRoom) {
  return Object.values(room.players).filter((p) => !room.awayUntil?.[p.id] && p.team !== 'spectator').length || 1
}

function aliveDispensers(room: CombatRoom) {
  return room.monsters.filter((m) => m.kind === 'dispenser' && m.alive)
}

function nextDispenserId(room: CombatRoom) {
  let i = 2
  while (room.monsters.some((m) => m.id === `dispenser-${i}`)) i++
  return `dispenser-${i}`
}

function spawnExtraDispenser(room: CombatRoom, duck: ServerMonster, now: number): ServerMonster | null {
  const others = aliveDispensers(room).map((m) => ({ x: m.x, z: m.z }))
  const [spot] = placeDispensers(
    room.scene ?? 'kenney',
    1,
    now % 1_000_000_007,
    { x: duck.x, z: duck.z },
    [{ x: duck.x, z: duck.z }, ...others],
  )
  if (!spot) return null
  const x = spot.x
  const z = spot.z
  const hp = dispenserHp(livingCount(room))
  const m = fromDef({
    id: nextDispenserId(room),
    name: '飲水機',
    model: 'mage',
    kind: 'dispenser',
    maxHp: hp,
    patrol: [
      { x, z },
      { x: duck.x, z: duck.z },
    ],
  })
  m.x = x
  m.z = z
  m.wander = { x: duck.x, z: duck.z }
  m.nextSkill = now + 800 + Math.floor(Math.random() * 1600)
  return m
}

function emitDuckSpeech(room: CombatRoom, io: Server, speech: DuckSpeech | null) {
  const prev = room.duckSpeech
  const same = (prev?.text ?? null) === (speech?.text ?? null) && (prev?.until ?? 0) === (speech?.until ?? 0) && !!prev?.shout === !!speech?.shout
  room.duckSpeech = speech
  if (same) return
  io.to(room.roomId).emit('duck:speech', speech)
}

function playerNearDuck(room: CombatRoom, duck: ServerMonster, range: number) {
  for (const p of Object.values(room.players)) {
    if (room.awayUntil?.[p.id] || p.team === 'spectator' || p.hidden) continue
    if (Math.hypot(p.position[0] - duck.x, p.position[2] - duck.z) <= range) return true
  }
  return false
}

function pickDuckLine(last?: string) {
  const pool = DUCK_CHAT_LINES.filter((line) => line !== last)
  const src = pool.length ? pool : [...DUCK_CHAT_LINES]
  return src[Math.floor(Math.random() * src.length)]
}

function shoutSummon(room: CombatRoom, io: Server, now: number) {
  emitDuckSpeech(room, io, { text: DUCK_SUMMON_SHOUT, until: now + DUCK_SPEECH_HOLD_MS, shout: true })
  room.speechNextAt = now + DUCK_SPEECH_HOLD_MS + DUCK_SPEECH_GAP_MS
}

function tickDuckSpeech(room: CombatRoom, io: Server, duck: ServerMonster | undefined, now: number) {
  const cur = room.duckSpeech
  if (cur && now >= cur.until) {
    emitDuckSpeech(room, io, null)
  }
  if (!duck?.alive) return
  if (room.duckSpeech?.shout && now < room.duckSpeech.until) return
  if (!playerNearDuck(room, duck, DUCK_SPEECH_RANGE)) return
  if (now < (room.speechNextAt ?? 0)) return
  const line = pickDuckLine(room.lastDuckLine)
  room.lastDuckLine = line
  emitDuckSpeech(room, io, { text: line, until: now + DUCK_SPEECH_HOLD_MS, shout: false })
  room.speechNextAt = now + DUCK_SPEECH_HOLD_MS + DUCK_SPEECH_GAP_MS
}

function tickSummon(room: CombatRoom, io: Server, duck: ServerMonster | undefined, now: number) {
  if (!duck?.alive) return
  if (!room.nextSummonAt) room.nextSummonAt = (room.startAt ?? now) + DUCK_SUMMON_INTERVAL_MS
  if (now < room.nextSummonAt) return
  room.nextSummonAt = now + DUCK_SUMMON_INTERVAL_MS
  if (aliveDispensers(room).length >= DUCK_MAX_DISPENSERS) return
  const pet = spawnExtraDispenser(room, duck, now)
  if (!pet) return
  room.monsters.push(pet)
  shoutSummon(room, io, now)
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}

function tickOneDispenser(
  room: CombatRoom,
  io: Server,
  pet: ServerMonster,
  duck: ServerMonster | undefined,
  now: number,
  dt: number,
  extraWalls: { cx: number; cz: number; hx: number; hz: number }[],
  extraAabbs: { minX: number; maxX: number; minZ: number; maxZ: number }[],
  duckSeen: PlayerState | null,
  petCd: number,
  announce: () => void,
) {
  if (!pet.alive) return
  if (duck?.alive && duckSeen && now >= Math.max(pet.nextSkill, room.startAt ?? 0)) {
    pet.pounceUntil = now + PET_POUNCE_MS
    pet.nextSkill = now + petCd
    pet.pounceTargetId = duckSeen.id
    announce()
  } else if (!duck?.alive && now >= Math.max(pet.nextSkill, room.startAt ?? 0)) {
    const seen = nearestVisible(room, pet.x, pet.z, extraWalls, BOSS_SIGHT)
    if (seen.target) {
      pet.pounceUntil = now + PET_POUNCE_MS
      pet.nextSkill = now + petCd
      pet.pounceTargetId = seen.target.id
    }
  }

  const pouncing = now < pet.pounceUntil
  let tx = duck?.alive ? duck.x - Math.sin(duck.rotationY) * 1.35 : pet.wander.x
  let tz = duck?.alive ? duck.z - Math.cos(duck.rotationY) * 1.35 : pet.wander.z
  let speed = PET_FOLLOW_SPEED
  let prey: PlayerState | null = null
  if (pouncing) {
    prey = (pet.pounceTargetId && room.players[pet.pounceTargetId]) || nearestVisible(room, pet.x, pet.z, extraWalls, 40).target
    if (prey) {
      tx = prey.position[0]
      tz = prey.position[2]
      speed = PET_POUNCE_SPEED
    }
  } else if (!duck?.alive) {
    const roam = nearestVisible(room, pet.x, pet.z, extraWalls, BOSS_SIGHT)
    if (roam.target) {
      tx = roam.target.position[0]
      tz = roam.target.position[2]
      speed = CHASE_SPEED
      prey = roam.target
    } else if (Math.hypot(pet.x - pet.wander.x, pet.z - pet.wander.z) < 1.2) {
      pet.wander = pickWander(pet.x, pet.z)
    }
  }
  const beforeX = pet.x
  const beforeZ = pet.z
  stepMonster(room, pet, tx, tz, speed, dt, extraAabbs)
  const others = aliveDispensers(room)
    .filter((m) => m !== pet)
    .map((m) => ({ x: m.x, z: m.z }))
  const spaced = clampDispenserStep(beforeX, beforeZ, pet.x, pet.z, others)
  pet.x = spaced.x
  pet.z = spaced.z
  const nav = heightFieldOf(room.scene)
  if (nav) {
    const gy = groundY(nav, pet.x, pet.z)
    if (gy != null) pet.y = gy
  }
  maybeMonsterOpenDoor(room, io, pet, tx, tz, now)
  if (prey) {
    const dist = Math.hypot(prey.position[0] - pet.x, prey.position[2] - pet.z)
    tryTouch(room, io, pet, prey, now, dist, PET_DAMAGE)
  }
}

function tickBoss(room: CombatRoom, io: Server, now: number, dt: number) {
  if (room.matchOver) return
  if (!room.started) return
  if (room.startAt && now < room.startAt) return
  if (room.startAt && now >= room.startAt) scaleBossHealth(room)
  const extraWalls = sceneWalls(room, now)
  const extraAabbs = sceneAabbs(room, now)
  const duck = room.monsters.find((m) => m.kind === 'duck-king')
  maybeRage(room, io, now)
  const raging = duck?.phase === 2
  const petCd = raging ? PET_SKILL_CD_RAGE_MS : PET_SKILL_CD_MS
  let duckSeen: PlayerState | null = null

  if (duck?.alive) {
    const slamR = raging ? SLAM_RADIUS_RAGE : SLAM_RADIUS
    const slamWind = raging ? SLAM_WINDUP_RAGE_MS : SLAM_WINDUP_MS
    const slamCd = raging ? SLAM_CD_RAGE_MS : SLAM_CD_MS
    const pausing = now < duck.invulnUntil

    if (duck.windupUntil && !duck.slamResolved && now >= duck.windupUntil) {
      duck.slamResolved = true
      for (const p of Object.values(room.players)) {
        if (room.awayUntil?.[p.id] || p.team === 'spectator' || isDowned(p, now)) continue
        const dist = Math.hypot(p.position[0] - duck.x, p.position[2] - duck.z)
        if (dist <= duck.slamRadius) hurtPlayer(room, io, p, SLAM_DAMAGE, now)
      }
    }
    let nearSlam = false
    for (const p of Object.values(room.players)) {
      if (room.awayUntil?.[p.id] || p.team === 'spectator') continue
      if (Math.hypot(p.position[0] - duck.x, p.position[2] - duck.z) <= SLAM_RANGE) nearSlam = true
    }
    if (!pausing && (!duck.windupUntil || now >= duck.windupUntil) && nearSlam && now >= duck.nextSlam) {
      duck.windupUntil = now + slamWind
      duck.slamResolved = false
      duck.slamRadius = slamR
      duck.nextSlam = now + slamCd
      io.to(room.roomId).emit('boss:telegraph', { x: duck.x, z: duck.z, r: slamR, ms: slamWind })
    }
    const winding = now < duck.windupUntil

    const seen = nearestVisible(room, duck.x, duck.z, extraWalls, BOSS_SIGHT)
    let tx = duck.wander.x
    let tz = duck.wander.z
    let speed = PATROL_SPEED
    const canFlee = now >= (room.startAt ?? duck.spawnedAt)
    if (seen.target && canFlee) {
      const dx = duck.x - seen.target.position[0]
      const dz = duck.z - seen.target.position[2]
      const len = Math.hypot(dx, dz) || 1
      tx = duck.x + (dx / len) * 8
      tz = duck.z + (dz / len) * 8
      const fleeField = heightFieldOf(room.scene)
      const fleeOpen = fleeField ? groundY(fleeField, tx, tz) != null : isWalkableWorld(tx, tz, 0.2)
      if (!fleeOpen) {
        const side = pickWander(duck.x, duck.z, 6)
        tx = side.x
        tz = side.z
      }
      speed = raging ? FLEE_SPEED_RAGE : FLEE_SPEED
    }
    if (!winding && !pausing) {
      const { remain, moved } = stepMonster(room, duck, tx, tz, speed, dt, extraAabbs)
      if (!seen.target && (remain < 1.1 || moved < 0.02)) {
        duck.wander = pickWander(duck.x, duck.z)
      }
    }
    maybeMonsterOpenDoor(room, io, duck, tx, tz, now)
    duckSeen = seen.target
  }

  tickSummon(room, io, duck, now)
  tickDuckSpeech(room, io, duck, now)

  let announced = false
  for (const pet of aliveDispensers(room)) {
    tickOneDispenser(room, io, pet, duck, now, dt, extraWalls, extraAabbs, duckSeen, petCd, () => {
      if (announced) return
      announced = true
      io.to(room.roomId).emit('combat:skill', { text: '鴨大王派出了飲水機！' })
    })
  }
}

export function rankingOf(room: CombatRoom): DamageRank[] {
  return Object.entries(room.damage ?? {})
    .map(([id, v]) => ({ id, name: v.name, dmg: v.dmg }))
    .sort((a, b) => b.dmg - a.dmg)
}

export function tickRoom(room: CombatRoom, io: Server, now: number, dt: number) {
  if (room.smokes?.length) {
    const next = room.smokes.filter((c) => c.until > now)
    if (next.length !== room.smokes.length) {
      room.smokes = next
      for (const id of Object.keys(room.players ?? {})) {
        io.to(id).emit(
          'smoke:sync',
          publishSmokes(next, room.poopSticks, room.players[id] ?? { id }, room.mode, now),
        )
      }
    }
  }
  if (room.mode === 'boss' && room.started && !room.matchOver && room.matchDeadline && now >= room.matchDeadline) {
    const duck = room.monsters.find((m) => m.kind === 'duck-king')
    if (duck?.alive) {
      room.matchOver = { teamWin: false, reason: 'timeout', ranking: rankingOf(room), awards: bossAwards(room) }
      emitDuckSpeech(room, io, null)
      io.to(room.roomId).emit('match:over', room.matchOver)
    }
  }
  if (room.matchOver) return
  tickDowned(room, io, now)
  flushPendingWin(room, io, now)
  if (room.mode === 'tag') {
    tickTag(room, io, now)
    return
  }
  tickCombatFacing(room, io, now)
  if (room.mode === 'boss') tickBoss(room, io, now, dt)
  else tickHunt(room, io, now, dt)
  tickLoot(room, io, now)
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
  io.to(room.roomId).emit('projectiles:sync', room.projectiles ?? [])
}

function maybeWin(room: CombatRoom, io: Server, _killerId: string) {
  if (room.mode !== 'boss' || room.matchOver || room.pendingWinAt) return
  const duck = room.monsters.find((m) => m.kind === 'duck-king')
  if (!duck || duck.alive) return
  if (room.monsters.some((m) => m.kind === 'dispenser' && m.alive)) return
  room.pendingWinAt = Date.now() + MATCH_WIN_DELAY_MS
}

function flushPendingWin(room: CombatRoom, io: Server, now: number) {
  if (!room.pendingWinAt || now < room.pendingWinAt || room.matchOver) return
  room.matchOver = { teamWin: true, reason: 'cleared', ranking: rankingOf(room), awards: bossAwards(room) }
  room.pendingWinAt = undefined
  emitDuckSpeech(room, io, null)
  io.to(room.roomId).emit('match:over', room.matchOver)
}

function weaponOf(player: PlayerState) {
  const kind = player.weapon && (player.weaponUntil ?? 0) > Date.now() ? player.weapon : 'sword'
  return WEAPON_STATS[kind] ?? WEAPON_STATS.sword
}

function syncBarrels(room: CombatRoom, io: Server) {
  io.to(room.roomId).emit('barrels:sync', { barrels: room.barrels ?? [], drops: room.drops ?? [] })
}

function hitBarrel(room: CombatRoom, io: Server, player: PlayerState, now: number, stats: (typeof WEAPON_STATS)['sword']) {
  if (room.mode === 'tag') return false
  if (!room.barrels) return false
  let best: BarrelState | null = null
  let bestD = stats.range
  for (const b of room.barrels) {
    if (!b.alive) continue
    const dist = Math.hypot(b.x - player.position[0], b.z - player.position[2])
    if (dist > bestD) continue
    if (!meleeHits(player.position[0], player.position[2], player.rotationY, b.x, b.z, stats.range)) continue
    best = b
    bestD = dist
  }
  if (!best) return false
  best.hp -= stats.damage
  io.to(room.roomId).emit('combat:hit', {
    id: best.id,
    kind: 'monster',
    amount: stats.damage,
    x: best.x,
    z: best.z,
    by: player.id,
  })
  if (best.hp <= 0) {
    best.hp = 0
    best.alive = false
    best.respawnAt = room.mode === 'hunt' ? now + BARREL_RESPAWN_MS : Number.POSITIVE_INFINITY
    io.to(room.roomId).emit('barrel:break', { id: best.id, x: best.x, z: best.z })
    const loot = rollDrop()
    if (loot) {
      if (!room.drops) room.drops = []
      room.drops.push({
        id: `drop-${now}-${best.id}`,
        x: best.x,
        z: best.z,
        kind: loot,
        until: now + DROP_TTL_MS,
      })
    }
  }
  syncBarrels(room, io)
  return true
}

function facingBodies(room: CombatRoom) {
  return room.monsters.map((m) => ({ id: m.id, x: m.x, z: m.z, alive: m.alive }))
}

export function publishCombatFacing(room: CombatRoom, io: Server, playerId: string, now: number, force = false) {
  if (room.mode === 'tag') return
  const player = room.players[playerId]
  if (!player) return
  const lock = room.combatLock?.[playerId]
  const live = activeLock(lock, now)
  if (!live) {
    if (lock && room.combatLock) delete room.combatLock[playerId]
    return
  }
  const yaw = combatYaw(
    room.mode,
    live,
    now,
    { x: player.position[0], z: player.position[2], rotationY: player.rotationY },
    facingBodies(room),
  )
  const prev = player.rotationY
  player.rotationY = yaw
  const delta = Math.atan2(Math.sin(prev - yaw), Math.cos(prev - yaw))
  if (!force && Math.abs(delta) < 1e-3) return
  io.to(room.roomId).emit('combat:facing', combatFacingPayload(playerId, yaw, live))
}

function tickCombatFacing(room: CombatRoom, io: Server, now: number) {
  if (room.mode === 'tag' || !room.combatLock) return
  for (const id of Object.keys(room.combatLock)) publishCombatFacing(room, io, id, now)
}

export function handleAttack(room: CombatRoom, playerId: string, io: Server, now: number, attackerSocketId?: string) {
  if (room.mode === 'tag') {
    handleTagAttack(room, io, playerId, now, attackerSocketId)
    return
  }
  const player = room.players[playerId]
  if (!player || player.seated || player.hidden || player.team === 'spectator') return
  if (isDowned(player, now)) return
  if (room.matchOver) return
  if (room.mode === 'boss' && !room.started) return
  if (room.startAt && now < room.startAt) return
  if (room.awayUntil?.[playerId]) return
  if (activeLock(room.combatLock?.[playerId], now)) publishCombatFacing(room, io, playerId, now)
  const stats = weaponOf(player)
  if ((room.nextAttack[playerId] ?? 0) > now) return
  room.nextAttack[playerId] = now + stats.cooldown
  if (!room.comboStep) room.comboStep = {}
  if (!room.lastSwingAt) room.lastSwingAt = {}
  const combo = nextComboStep(room.comboStep[playerId] ?? 0, room.lastSwingAt[playerId] ?? 0, now)
  room.comboStep[playerId] = combo
  room.lastSwingAt[playerId] = now
  const swing = attackerSocketId
    ? io.to(room.roomId).except(attackerSocketId)
    : io.to(room.roomId).except(playerId)
  swing.emit('player:swing', { id: playerId, combo })

  let best: ServerMonster | null = null
  let bestD = stats.range
  for (const m of room.monsters) {
    if (!m.alive) continue
    const dist = Math.hypot(m.x - player.position[0], m.z - player.position[2])
    if (dist > bestD) continue
    if (!meleeHits(player.position[0], player.position[2], player.rotationY, m.x, m.z, stats.range)) continue
    best = m
    bestD = dist
  }
  const sightField = heightFieldOf(room.scene)
  const sightMy = sightField ? (groundY(sightField, best?.x ?? 0, best?.z ?? 0) ?? 0) : 0
  if (
    best &&
    !hasLineOfSight(
      player.position[0],
      player.position[2],
      best.x,
      best.z,
      sceneWalls(room, now),
      sightField,
      player.position[1] ?? 0,
      sightMy,
    )
  ) {
    best = null
  }
  const bodies = facingBodies(room)
  const nextLock = attackCombat(
    room.mode,
    room.combatLock?.[playerId],
    now,
    { x: player.position[0], z: player.position[2] },
    bodies,
    best?.id ?? null,
  )
  if (!room.combatLock) room.combatLock = {}
  if (nextLock) room.combatLock[playerId] = nextLock
  else delete room.combatLock[playerId]
  if (nextLock) publishCombatFacing(room, io, playerId, now, true)
  if (!best) {
    hitBarrel(room, io, player, now, stats)
    return
  }
  if (best.kind === 'duck-king' && now < best.invulnUntil) return
  hurtMonster(room, io, best, stats.damage, playerId, player.name, now)
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}

export function hurtMonster(
  room: CombatRoom,
  io: Server,
  monster: ServerMonster,
  amount: number,
  playerId: string,
  playerName: string,
  now: number,
) {
  if (!monster.alive || amount <= 0) return 0
  if (monster.kind === 'duck-king' && now < monster.invulnUntil) return 0
  const dealt = Math.min(amount, Math.max(0, monster.hp))
  if (dealt <= 0) return 0
  io.to(room.roomId).emit('combat:hit', {
    id: monster.id,
    kind: 'monster',
    amount: dealt,
    x: monster.x,
    z: monster.z,
    by: playerId,
  })
  monster.hp -= dealt
  monster.lastHitBy = playerId
  if (!room.damage) room.damage = {}
  const row = room.damage[playerId] ?? { name: playerName, dmg: 0 }
  row.name = playerName
  row.dmg += dealt
  room.damage[playerId] = row
  maybeRage(room, io, now)
  if (monster.hp <= 0) {
    monster.hp = 0
    monster.alive = false
    monster.diedAt = now
    monster.respawnAt = room.mode === 'boss' ? Number.POSITIVE_INFINITY : Math.max(now + CORPSE_MS, now + RESPAWN_MS)
    if (monster.kind === 'dispenser') {
      if (!room.dispenserKills) room.dispenserKills = {}
      room.dispenserKills[playerId] = (room.dispenserKills[playerId] ?? 0) + 1
      announce(room, io, `${playerName} 打倒了 飲水機`)
    }
    maybeWin(room, io, playerId)
  }
  return dealt
}

function tickLoot(room: CombatRoom, io: Server, now: number) {
  if (room.barrels) {
    let changed = false
    for (const b of room.barrels) {
      if (!b.alive && b.respawnAt && now >= b.respawnAt && Number.isFinite(b.respawnAt)) {
        b.alive = true
        b.hp = BARREL_HP
        b.respawnAt = 0
        changed = true
      }
    }
    if (changed) syncBarrels(room, io)
  }
  if (room.drops?.length) {
    const next = room.drops.filter((d) => d.until > now)
    if (next.length !== room.drops.length) {
      room.drops = next
      syncBarrels(room, io)
    }
    for (const drop of [...(room.drops ?? [])]) {
      for (const p of Object.values(room.players)) {
        if (room.awayUntil?.[p.id] || p.team === 'spectator' || p.hidden) continue
        if (Math.hypot(p.position[0] - drop.x, p.position[2] - drop.z) > PICKUP_RANGE) continue
        room.drops = (room.drops ?? []).filter((d) => d.id !== drop.id)
        if (drop.kind === 'heal') {
          p.hp = Math.min(PLAYER_MAX_HP, (p.hp ?? PLAYER_MAX_HP) + HEAL_POTION)
          io.to(room.roomId).emit('player:vitals', { id: p.id, hp: p.hp })
        } else {
          p.weapon = drop.kind
          p.weaponUntil = now + WEAPON_TTL_MS
          io.to(room.roomId).emit('player:weapon', { id: p.id, weapon: p.weapon, until: p.weaponUntil })
        }
        io.to(room.roomId).emit('loot:pickup', { id: drop.id, by: p.id, kind: drop.kind })
        syncBarrels(room, io)
        break
      }
    }
  }
  for (const p of Object.values(room.players)) {
    if (p.weapon && p.weapon !== 'sword' && (p.weaponUntil ?? 0) <= now) {
      p.weapon = 'sword'
      p.weaponUntil = 0
      io.to(room.roomId).emit('player:weapon', { id: p.id, weapon: 'sword', until: 0 })
    }
  }
}
