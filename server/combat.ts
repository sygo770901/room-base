import type { Server } from 'socket.io'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import {
  ATTACK_COS,
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  ATTACK_EMBED,
  ATTACK_RANGE,
  CHASE_SPEED,
  IFRAME_MS,
  MONSTER_DAMAGE,
  MONSTER_HIT_CD,
  MONSTER_RADIUS,
  MONSTER_TOUCH,
  PATROL_SPEED,
  PLAYER_MAX_HP,
  RESPAWN_MS,
  SIGHT,
  type MonsterState,
} from '../shared/combat.ts'
import { MONSTER_DEFS, SPAWN_POINTS, hasLineOfSight, type MonsterDef } from '../shared/dungeon.ts'
import type { PlayerState } from './types.ts'

export interface ServerMonster {
  id: string
  name: string
  model: MonsterDef['model']
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
}

export interface CombatRoom {
  roomId: string
  players: Record<string, PlayerState>
  monsters: ServerMonster[]
  hurtUntil: Record<string, number>
  nextAttack: Record<string, number>
}

export function createMonsters(): ServerMonster[] {
  return MONSTER_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    model: d.model,
    maxHp: d.maxHp,
    hp: d.maxHp,
    x: d.patrol[0].x,
    z: d.patrol[0].z,
    rotationY: 0,
    alive: true,
    patrol: d.patrol,
    patrolI: 0,
    nextHit: 0,
    respawnAt: 0,
  }))
}

export function publicMonsters(list: ServerMonster[]): MonsterState[] {
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    model: m.model,
    x: m.x,
    z: m.z,
    rotationY: m.rotationY,
    hp: m.hp,
    maxHp: m.maxHp,
    alive: m.alive,
  }))
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

export function tickRoom(room: CombatRoom, io: Server, now: number, dt: number) {
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

    let target: PlayerState | null = null
    let best = SIGHT
    for (const p of Object.values(room.players)) {
      if (p.hidden) continue
      const d = Math.hypot(p.position[0] - m.x, p.position[2] - m.z)
      if (d > SIGHT || d >= best) continue
      if (!hasLineOfSight(m.x, m.z, p.position[0], p.position[2])) continue
      best = d
      target = p
    }

    const wp = m.patrol[m.patrolI]
    let tx = wp.x
    let tz = wp.z
    let speed = PATROL_SPEED
    if (target) {
      tx = target.position[0]
      tz = target.position[2]
      speed = CHASE_SPEED
      if (best <= MONSTER_TOUCH && now >= m.nextHit && now >= (room.hurtUntil[target.id] ?? 0)) {
        m.nextHit = now + MONSTER_HIT_CD
        hurtPlayer(room, io, target, MONSTER_DAMAGE, now)
      }
    }

    const dx = tx - m.x
    const dz = tz - m.z
    const len = Math.hypot(dx, dz) || 1
    const step = Math.min(speed * dt, len)
    const mx = (dx / len) * step
    const mz = (dz / len) * step
    const beforeX = m.x
    const beforeZ = m.z
    const moved = resolvePlayerMove(m.x, m.z, mx, mz, [], MONSTER_RADIUS)
    m.x = moved.x
    m.z = moved.z
    if (Math.abs(m.x - beforeX) > 0.001 || Math.abs(m.z - beforeZ) > 0.001) {
      m.rotationY = Math.atan2(m.x - beforeX, m.z - beforeZ)
    }
    if (!target && (len < 0.85 || Math.hypot(m.x - beforeX, m.z - beforeZ) < 0.02)) {
      m.patrolI = (m.patrolI + 1) % m.patrol.length
    }
  }

  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}

export function handleAttack(room: CombatRoom, playerId: string, io: Server, now: number) {
  const player = room.players[playerId]
  if (!player || player.seated) return
  if ((room.nextAttack[playerId] ?? 0) > now) return
  room.nextAttack[playerId] = now + ATTACK_COOLDOWN_MS
  io.to(room.roomId).except(playerId).emit('player:swing', { id: playerId })

  const fx = Math.sin(player.rotationY)
  const fz = Math.cos(player.rotationY)
  let best: ServerMonster | null = null
  let bestD = ATTACK_RANGE
  for (const m of room.monsters) {
    if (!m.alive) continue
    const dx = m.x - player.position[0]
    const dz = m.z - player.position[2]
    const dist = Math.hypot(dx, dz)
    if (dist > bestD) continue
    if (dist >= ATTACK_EMBED) {
      const dot = (dx / dist) * fx + (dz / dist) * fz
      if (dot < ATTACK_COS) continue
    }
    best = m
    bestD = dist
  }
  if (!best) return
  io.to(room.roomId).emit('combat:hit', {
    id: best.id,
    kind: 'monster',
    amount: ATTACK_DAMAGE,
    x: best.x,
    z: best.z,
  })
  best.hp -= ATTACK_DAMAGE
  if (best.hp <= 0) {
    best.hp = 0
    best.alive = false
    best.respawnAt = now + RESPAWN_MS
  }
  io.to(room.roomId).emit('monsters:sync', publicMonsters(room.monsters))
}
