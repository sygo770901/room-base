import type { Server } from 'socket.io'
import { resolvePlayerMove, KAYKIT_EXTRA_AABBS } from '../src/physics/collision.ts'
import {
  ATTACK_COS,
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  ATTACK_RANGE,
  type DamageRank,
  BOSS_SIGHT,
  CHASE_SPEED,
  FLEE_SPEED,
  IFRAME_MS,
  MONSTER_DAMAGE,
  MONSTER_HIT_CD,
  MONSTER_TOUCH,
  PATROL_SPEED,
  PET_DAMAGE,
  PET_FOLLOW_SPEED,
  PET_POUNCE_MS,
  PET_POUNCE_SPEED,
  PET_SKILL_CD_MS,
  PLAYER_MAX_HP,
  RESPAWN_MS,
  SIGHT,
  monsterRadius,
  type MatchOver,
  type MonsterKind,
  type MonsterState,
} from '../shared/combat.ts'
import { KAYKIT_EXTRA_WALLS } from '../shared/kaykitScene.ts'
import {
  BOSS_DEFS,
  FLOOR_CENTERS,
  MONSTER_DEFS,
  SPAWN_POINTS,
  hasLineOfSight,
  isWalkableWorld,
  type MonsterDef,
} from '../shared/dungeon.ts'
import type { GameMode } from '../shared/modes.ts'
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
}

export interface CombatRoom {
  roomId: string
  scene?: 'kenney' | 'kaykit'
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
  }
}

export function createMonsters(): ServerMonster[] {
  return MONSTER_DEFS.map(fromDef)
}

export function createBossMonsters(): ServerMonster[] {
  return BOSS_DEFS.map(fromDef)
}

export function publicMonsters(list: ServerMonster[]): MonsterState[] {
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    model: m.model,
    kind: m.kind,
    x: m.x,
    z: m.z,
    rotationY: m.rotationY,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.alive,
    pouncing: m.kind === 'dispenser' && m.pounceUntil > Date.now(),
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
    if (room.awayUntil?.[p.id]) continue
    const d = Math.hypot(p.position[0] - mx, p.position[2] - mz)
    if (d > sight || d >= best) continue
    if (!hasLineOfSight(mx, mz, p.position[0], p.position[2], extraWalls)) continue
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
  const moved = resolvePlayerMove(m.x, m.z, mx, mz, [], r, extraAabbs)
  m.x = moved.x
  m.z = moved.z
  if (Math.abs(m.x - beforeX) > 0.001 || Math.abs(m.z - beforeZ) > 0.001) {
    m.rotationY = Math.atan2(m.x - beforeX, m.z - beforeZ)
  }
  return { moved: Math.hypot(m.x - beforeX, m.z - beforeZ), remain: Math.hypot(tx - m.x, tz - m.z) }
}

function hurtPlayer(room: CombatRoom, io: Server, player: PlayerState, dmg: number, now: number) {
  const x = player.position[0]
  const z = player.position[2]
  player.hp = Math.max(0, (player.hp ?? PLAYER_MAX_HP) - dmg)
  io.to(room.roomId).emit('combat:hit', {
    id: player.id,
    kind: 'player',
    amount: dmg,
    x,
    z,
  })
  if (player.hp <= 0) {
    const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]
    player.hp = PLAYER_MAX_HP
    player.position = [sp.x, 0, sp.z]
    player.seated = null
    room.hurtUntil[player.id] = now + IFRAME_MS
    io.to(player.id).emit('player:respawn', {
      position: player.position,
      hp: player.hp,
      rotationY: player.rotationY,
    })
    io.to(room.roomId).emit('player:moved', {
      id: player.id,
      position: player.position,
      rotationY: player.rotationY,
    })
  }
  io.to(room.roomId).emit('player:vitals', { id: player.id, hp: player.hp })
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
  if (dist <= touch && now >= m.nextHit && now >= (room.hurtUntil[target.id] ?? 0)) {
    m.nextHit = now + MONSTER_HIT_CD
    hurtPlayer(room, io, target, dmg, now)
  }
}

function tickHunt(room: CombatRoom, io: Server, now: number, dt: number) {
  const extraWalls = room.scene === 'kaykit' ? KAYKIT_EXTRA_WALLS : []
  const extraAabbs = room.scene === 'kaykit' ? KAYKIT_EXTRA_AABBS : []
  for (const m of room.monsters) {
    if (!m.alive) {
      if (now >= m.respawnAt) {
        const p = m.patrol[0]
        m.alive = true
        m.hp = m.maxHp
        m.x = p.x
        m.z = p.z
        m.patrolI = 0
      }
      continue
    }

    const seen = nearestVisible(room, m.x, m.z, extraWalls, SIGHT)
    const wp = m.patrol[m.patrolI]
    let tx = wp.x
    let tz = wp.z
    let speed = PATROL_SPEED
    if (seen.target) {
      tx = seen.target.position[0]
      tz = seen.target.position[2]
      speed = CHASE_SPEED
      tryTouch(room, io, m, seen.target, now, seen.dist, MONSTER_DAMAGE)
    }

    const { moved, remain } = stepMonster(room, m, tx, tz, speed, dt, extraAabbs)
    if (!seen.target && (remain < 0.85 || moved < 0.02)) {
      m.patrolI = (m.patrolI + 1) % m.patrol.length
    }
  }
}

function tickBoss(room: CombatRoom, io: Server, now: number, dt: number) {
  if (room.matchOver) return
  const extraWalls = room.scene === 'kaykit' ? KAYKIT_EXTRA_WALLS : []
  const extraAabbs = room.scene === 'kaykit' ? KAYKIT_EXTRA_AABBS : []
  const duck = room.monsters.find((m) => m.kind === 'duck-king')
  const pet = room.monsters.find((m) => m.kind === 'dispenser')

  if (duck?.alive) {
    const seen = nearestVisible(room, duck.x, duck.z, extraWalls, BOSS_SIGHT)
    let tx = duck.wander.x
    let tz = duck.wander.z
    let speed = PATROL_SPEED
    const canFlee = now - duck.spawnedAt > 8000
    if (seen.target && canFlee) {
      const dx = duck.x - seen.target.position[0]
      const dz = duck.z - seen.target.position[2]
      const len = Math.hypot(dx, dz) || 1
      tx = duck.x + (dx / len) * 8
      tz = duck.z + (dz / len) * 8
      if (!isWalkableWorld(tx, tz, 0.2)) {
        const side = pickWander(duck.x, duck.z, 6)
        tx = side.x
        tz = side.z
      }
      speed = FLEE_SPEED
    }
    const { remain, moved } = stepMonster(room, duck, tx, tz, speed, dt, extraAabbs)
    if (!seen.target && (remain < 1.1 || moved < 0.02)) {
      duck.wander = pickWander(duck.x, duck.z)
    }

    if (pet?.alive && seen.target && now >= pet.nextSkill) {
      pet.pounceUntil = now + PET_POUNCE_MS
      pet.nextSkill = now + PET_SKILL_CD_MS
      pet.pounceTargetId = seen.target.id
      io.to(room.roomId).emit('combat:skill', { text: '鴨大王派出了飲水機！' })
    }
  } else if (pet?.alive && now >= pet.nextSkill) {
    const seen = nearestVisible(room, pet.x, pet.z, extraWalls, BOSS_SIGHT)
    if (seen.target) {
      pet.pounceUntil = now + PET_POUNCE_MS
      pet.nextSkill = now + PET_SKILL_CD_MS
      pet.pounceTargetId = seen.target.id
    }
  }

  if (pet?.alive) {
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
    stepMonster(room, pet, tx, tz, speed, dt, extraAabbs)
    if (prey) {
      const dist = Math.hypot(prey.position[0] - pet.x, prey.position[2] - pet.z)
      tryTouch(room, io, pet, prey, now, dist, PET_DAMAGE)
    }
  }
}

export function rankingOf(room: CombatRoom): DamageRank[] {
  return Object.entries(room.damage ?? {})
    .map(([id, v]) => ({ id, name: v.name, dmg: v.dmg }))
    .sort((a, b) => b.dmg - a.dmg)
}

export function tickRoom(room: CombatRoom, io: Server, now: number, dt: number) {
  if (room.mode === 'boss' && !room.matchOver && room.matchDeadline && now >= room.matchDeadline) {
    const duck = room.monsters.find((m) => m.kind === 'duck-king')
    if (duck?.alive) {
      room.matchOver = { teamWin: false, reason: 'timeout', ranking: rankingOf(room) }
      io.to(room.roomId).emit('match:over', room.matchOver)
    }
  }
  if (room.matchOver) return
  if (room.mode === 'boss') tickBoss(room, io, now, dt)
  else tickHunt(room, io, now, dt)
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}

function maybeWin(room: CombatRoom, io: Server, _killerId: string) {
  if (room.mode !== 'boss' || room.matchOver) return
  const duck = room.monsters.find((m) => m.kind === 'duck-king')
  const pet = room.monsters.find((m) => m.kind === 'dispenser')
  if (!duck || !pet || duck.alive || pet.alive) return
  room.matchOver = { teamWin: true, reason: 'cleared', ranking: rankingOf(room) }
  io.to(room.roomId).emit('match:over', room.matchOver)
}

export function handleAttack(room: CombatRoom, playerId: string, io: Server, now: number, attackerSocketId?: string) {
  const player = room.players[playerId]
  if (!player || player.seated || player.hidden) return
  if (room.matchOver) return
  if (room.awayUntil?.[playerId]) return
  if ((room.nextAttack[playerId] ?? 0) > now) return
  room.nextAttack[playerId] = now + ATTACK_COOLDOWN_MS
  const swing = attackerSocketId
    ? io.to(room.roomId).except(attackerSocketId)
    : io.to(room.roomId).except(playerId)
  swing.emit('player:swing', { id: playerId })

  const fx = Math.sin(player.rotationY)
  const fz = Math.cos(player.rotationY)
  let best: ServerMonster | null = null
  let bestD = ATTACK_RANGE
  for (const m of room.monsters) {
    if (!m.alive) continue
    const dx = m.x - player.position[0]
    const dz = m.z - player.position[2]
    const dist = Math.hypot(dx, dz)
    const embed = 0.26 + monsterRadius(m.kind)
    if (dist > bestD) continue
    if (dist >= embed) {
      const dot = (dx / dist) * fx + (dz / dist) * fz
      if (dot < ATTACK_COS) continue
    }
    best = m
    bestD = dist
  }
  if (!best) return
  const dealt = Math.min(ATTACK_DAMAGE, Math.max(0, best.hp))
  if (dealt <= 0) return
  io.to(room.roomId).emit('combat:hit', {
    id: best.id,
    kind: 'monster',
    amount: dealt,
    x: best.x,
    z: best.z,
  })
  best.hp -= dealt
  best.lastHitBy = playerId
  if (!room.damage) room.damage = {}
  const row = room.damage[playerId] ?? { name: player.name, dmg: 0 }
  row.name = player.name
  row.dmg += dealt
  room.damage[playerId] = row
  if (best.hp <= 0) {
    best.hp = 0
    best.alive = false
    best.respawnAt = room.mode === 'boss' ? Number.POSITIVE_INFINITY : now + RESPAWN_MS
    maybeWin(room, io, playerId)
  }
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}
