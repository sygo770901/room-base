import type { Server } from 'socket.io'
import { ATTACK_COOLDOWN_MS, ATTACK_RANGE, meleeHits, PLAYER_MAX_HP, type MatchOver } from '../shared/combat.ts'
import { nextComboStep } from '../shared/anim.ts'
import { HIDE_RANGE, HIDE_SPOTS } from '../shared/dungeon.ts'
import { heightBlocksSight, canMoveTo, groundY } from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import type { GameMode, RoomSettings } from '../shared/modes.ts'
import {
  DASH_DISTANCE,
  JUMP_MAX_DELTA,
  MOVE_DT_CAP_SEC,
  MOVE_PAD,
  MOVE_SLACK,
  MOVE_Y_PAD,
  PLAYER_SPEED,
  cappedMoveDt,
  jumpCeilingFor,
  moveAllowance,
  type MoveGrant,
} from '../shared/movement.ts'
import { HIDE_MAX_Y, JUMP_GROUND_EPS, supportY, PLAYER_FOOT_RADIUS } from '../shared/platforms.ts'
import { doorsOf, platformsOf } from '../shared/mapData.ts'
import { POOP_SLOW_MUL, smokeHidesFrom, type SmokeCloud } from '../shared/smoke.ts'
import { doorHidesFrom, type DoorState } from '../shared/doors.ts'
import {
  TAG_BOX_MAX_MS,
  TAG_BOX_REENTER_MS,
  TAG_CHECK_CD_MS,
  TAG_CHECK_RANGE,
  TAG_HIDE_MS,
  TAG_TOUCH,
  TAG_UNTIMED_CAP_MS,
  type TagHud,
  type TagState,
} from '../shared/tag.ts'
import { computeAwards } from '../shared/awards.ts'
import { isDowned } from '../shared/downed.ts'
import { announce } from './feed.ts'
import type { PlayerState, Vec3 } from './types.ts'

export type { TagState }

export type MoveBank = {
  accruedAt: number
  walk: number
  dash: number
  pad: boolean
  dashMark?: number
}

/** 進房第一包可能和記點同一個時間戳，先留一筆正常步伐（約 0.2 秒走路）的預算。 */
const FIRST_STEP_SEC = 0.2

export function recordMoveOrigin(
  room: { lastMoveAt?: Record<string, number>; moveBank?: Record<string, MoveBank> },
  playerId: string,
  now: number,
) {
  if (!room.lastMoveAt) room.lastMoveAt = {}
  if (!room.moveBank) room.moveBank = {}
  const cap = PLAYER_SPEED * MOVE_DT_CAP_SEC * MOVE_SLACK + MOVE_PAD
  const normal = Math.min(cap, PLAYER_SPEED * FIRST_STEP_SEC * MOVE_SLACK + MOVE_PAD)
  room.lastMoveAt[playerId] = now
  room.moveBank[playerId] = { accruedAt: now, walk: normal, dash: 0, pad: true }
}

export interface TagRoom {
  roomId: string
  mode?: GameMode
  hostId?: string | null
  started?: boolean
  players: Record<string, PlayerState>
  notes?: unknown
  seats?: Record<string, string | null>
  furniture?: unknown
  monsters?: unknown[]
  matchOver?: MatchOver | null
  settings?: RoomSettings
  matchDeadline?: number | null
  startAt?: number
  awayUntil?: Record<string, number>
  nextAttack?: Record<string, number>
  comboStep?: Record<string, number>
  lastSwingAt?: Record<string, number>
  tag?: TagState
  lastMoveAt?: Record<string, number>
  moveGrant?: Record<string, MoveGrant>
  /** 同一段時間裡連續送到的移動，共用這份走路／衝刺預算。 */
  moveBank?: Record<string, MoveBank>
  smokes?: SmokeCloud[]
  doors?: DoorState[]
  scene?: string | null
  hideMs?: Record<string, number>
  taken?: Record<string, number>
  dispenserKills?: Record<string, number>
  rescues?: Record<string, number>
  feed?: import('../shared/events.ts').FeedItem[]
  poopSlowUntil?: Record<string, number>
}

export function emptyTag(): TagState {
  return {
    roundActive: false,
    hideUntil: 0,
    playUntil: null,
    timed: false,
    catches: {},
    caughtAt: {},
    hideEnteredAt: {},
    hideSpot: {},
    hideCooldown: {},
    nextCheck: {},
    opened: false,
  }
}

function presentPlayers(room: TagRoom) {
  return Object.values(room.players).filter((p) => !room.awayUntil?.[p.id])
}

function seekersOf(room: TagRoom, viewerId: string) {
  const viewer = room.players[viewerId]
  return viewer?.team === 'ghost' || viewer?.team === 'spectator'
}

function hidePhase(room: TagRoom, now = Date.now()) {
  return Boolean(room.tag?.roundActive && now < (room.tag.hideUntil ?? 0))
}

export function stripPlayer(p: PlayerState, away = false): PlayerState {
  return { ...p, away }
}

export function playerViewFor(room: TagRoom, viewerId: string, p: PlayerState): PlayerState {
  const away = Boolean(room.awayUntil?.[p.id])
  if (room.mode !== 'tag') return stripPlayer(p, away)
  if (p.id === viewerId) return stripPlayer(p, away)
  const viewer = room.players[viewerId]
  const heightHide =
    Boolean(p.position) &&
    Boolean(viewer?.position) &&
    heightBlocksSight(
      heightFieldOf(room.scene),
      viewer!.position[0],
      viewer!.position[1] ?? 0,
      viewer!.position[2],
      p.position[0],
      p.position[1] ?? 0,
      p.position[2],
    )
  if (heightHide) {
    const { position: _pos, phrase: _phrase, ...rest } = p
    return { ...rest, away } as PlayerState
  }
  if (!seekersOf(room, viewerId)) return stripPlayer(p, away)
  const hidingCoords = hidePhase(room) ? p.team === 'hider' : Boolean(p.hidden && p.team === 'hider')
  const smoked =
    p.team === 'hider' &&
    Boolean(p.position) &&
    Boolean(viewer?.position) &&
    smokeHidesFrom(
      room.smokes,
      { x: viewer!.position[0], z: viewer!.position[2] },
      { x: p.position[0], z: p.position[2] },
      Date.now(),
    )
  const behindDoor =
    p.team === 'hider' &&
    Boolean(p.position) &&
    Boolean(viewer?.position) &&
    doorHidesFrom(
      room.doors,
      { x: viewer!.position[0], z: viewer!.position[2] },
      { x: p.position[0], z: p.position[2] },
      doorsOf(room.scene),
    )
  if (!hidingCoords && !smoked && !behindDoor) return stripPlayer(p, away)
  const { position: _pos, phrase: _phrase, ...rest } = p
  return { ...rest, away } as PlayerState
}

export function playersForViewer(room: TagRoom, viewerId: string) {
  const out: Record<string, PlayerState> = {}
  for (const p of Object.values(room.players)) {
    out[p.id] = playerViewFor(room, viewerId, p)
  }
  return out
}

export function tagHudFor(room: TagRoom, viewerId: string, now = Date.now()): TagHud | null {
  if (room.mode !== 'tag') return null
  const tag = room.tag
  const me = room.players[viewerId]
  const hidersLeft = presentPlayers(room).filter((p) => p.team === 'hider').length
  const hideLeftMs = tag?.roundActive ? Math.max(0, tag.hideUntil - now) : 0
  const playLeftMs =
    tag?.roundActive && tag.timed && tag.playUntil ? Math.max(0, tag.playUntil - now) : null
  return {
    hideLeftMs,
    playLeftMs,
    hidersLeft,
    team: me?.team ?? null,
    nextCheckMs: Math.max(0, (tag?.nextCheck[viewerId] ?? 0) - now),
    roundActive: Boolean(tag?.roundActive),
  }
}

export function emitRoomState(
  room: TagRoom,
  io: Server,
  build: (players: Record<string, PlayerState>, viewerId: string, hud: TagHud | null) => unknown,
) {
  for (const id of Object.keys(room.players)) {
    io.to(id).emit('room:state', build(playersForViewer(room, id), id, tagHudFor(room, id)))
  }
}

export function emitPlayerMoved(room: TagRoom, io: Server, playerId: string) {
  const p = room.players[playerId]
  if (!p) return
  if (room.mode !== 'tag') {
    io.to(room.roomId).emit('player:moved', {
      id: playerId,
      position: p.position,
      rotationY: p.rotationY,
    })
    return
  }
  for (const viewerId of Object.keys(room.players)) {
    if (viewerId === playerId) continue
    const view = playerViewFor(room, viewerId, p)
    if (!view.position) continue
    io.to(viewerId).emit('player:moved', {
      id: playerId,
      position: view.position,
      rotationY: p.rotationY,
    })
  }
}

export function emitPlayerHidden(room: TagRoom, io: Server, playerId: string) {
  const p = room.players[playerId]
  if (!p) return
  for (const viewerId of Object.keys(room.players)) {
    const view = playerViewFor(room, viewerId, p)
    if (view.position) {
      io.to(viewerId).emit('player:hidden', {
        id: playerId,
        hidden: Boolean(p.hidden),
        position: view.position,
        rotationY: p.rotationY,
      })
    } else {
      io.to(viewerId).emit('player:hidden', { id: playerId, hidden: Boolean(p.hidden) })
    }
  }
}

export function emitPlayerJoined(room: TagRoom, io: Server, player: PlayerState) {
  for (const viewerId of Object.keys(room.players)) {
    if (viewerId === player.id) continue
    io.to(viewerId).emit('player:joined', playerViewFor(room, viewerId, player))
  }
}

function shuffle<T>(list: T[]) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

export function startTagRound(room: TagRoom, io: Server, now: number) {
  const ids = presentPlayers(room)
    .filter((p) => p.team !== 'spectator')
    .map((p) => p.id)
  if (ids.length < 2) {
    room.tag = emptyTag()
    for (const p of Object.values(room.players)) {
      if (p.team !== 'spectator') p.team = 'hider'
    }
    return false
  }
  const ghostCount = ids.length >= 6 ? 2 : 1
  const ghosts = new Set(shuffle(ids).slice(0, ghostCount))
  for (const p of Object.values(room.players)) {
    if (room.awayUntil?.[p.id]) continue
    p.team = ghosts.has(p.id) ? 'ghost' : p.team === 'spectator' ? 'spectator' : 'hider'
    p.hidden = false
    p.hp = PLAYER_MAX_HP
  }
  const hideUntil = now + TAG_HIDE_MS
  const timed = Boolean(room.settings?.timed)
  const playUntil = timed
    ? hideUntil + (room.settings?.timeLimitSec || 300) * 1000
    : hideUntil + TAG_UNTIMED_CAP_MS
  const catches: Record<string, number> = {}
  for (const id of ghosts) catches[id] = 0
  room.tag = {
    roundActive: true,
    hideUntil,
    playUntil,
    timed,
    catches,
    caughtAt: {},
    hideEnteredAt: {},
    hideSpot: {},
    hideCooldown: {},
    nextCheck: {},
    opened: false,
  }
  room.started = true
  room.matchOver = null
  room.matchDeadline = timed ? playUntil : null
  room.startAt = hideUntil
  io.to(room.roomId).emit('combat:skill', { text: '藏身開始，鬼 30 秒後出發' })
  return true
}

export function settleTag(room: TagRoom, io: Server, now: number) {
  if (room.mode !== 'tag' || room.matchOver || !room.tag?.roundActive) return
  if (room.tag.playUntil && now >= room.tag.playUntil) {
    const anyHider = Object.values(room.players).some((p) => p.team === 'hider')
    endTag(room, io, anyHider ? 'hiders' : 'ghosts', now)
    return
  }
  const presentHiders = presentPlayers(room).filter((p) => p.team === 'hider')
  if (presentHiders.length === 0) endTag(room, io, 'ghosts', now)
}

function rankingOf(room: TagRoom, now: number): MatchOver['ranking'] {
  const tag = room.tag
  const playStart = tag?.hideUntil ?? now
  return Object.values(room.players)
    .map((p) => {
      const catches = tag?.catches[p.id] ?? 0
      const caughtAt = tag?.caughtAt[p.id]
      const converted = Boolean(caughtAt)
      const isGhost = p.team === 'ghost' && !converted
      const surviveSec =
        !isGhost && p.team !== 'spectator'
          ? Math.max(0, Math.round(((caughtAt ?? now) - playStart) / 1000))
          : 0
      return {
        id: p.id,
        name: p.name,
        dmg: isGhost ? catches : surviveSec,
        catches,
        surviveSec,
        team: (isGhost ? 'ghost' : p.team === 'spectator' ? 'spectator' : 'hider') as
          | 'ghost'
          | 'hider'
          | 'spectator',
      }
    })
    .sort((a, b) => {
      if ((a.team === 'ghost') !== (b.team === 'ghost')) return a.team === 'ghost' ? -1 : 1
      return b.dmg - a.dmg
    })
}

function endTag(room: TagRoom, io: Server, winner: 'hiders' | 'ghosts', now: number) {
  if (room.matchOver) return
  const ranking = rankingOf(room, now)
  const hideMs = { ...(room.hideMs ?? {}) }
  for (const [id, at] of Object.entries(room.tag?.hideEnteredAt ?? {})) {
    hideMs[id] = (hideMs[id] ?? 0) + Math.max(0, now - at)
  }
  const over: MatchOver = {
    teamWin: winner === 'hiders',
    winner,
    ranking,
    awards: computeAwards({
      mode: 'tag',
      names: Object.fromEntries(Object.values(room.players).map((p) => [p.id, p.name])),
      catches: Object.fromEntries(ranking.map((r) => [r.id, r.catches ?? 0])),
      surviveSec: Object.fromEntries(ranking.map((r) => [r.id, r.surviveSec ?? 0])),
      hideMs,
    }),
  }
  room.matchOver = over
  if (room.tag) room.tag.roundActive = false
  io.to(room.roomId).emit('match:over', over)
}

export function catchHider(room: TagRoom, io: Server, ghostId: string, victimId: string, now: number) {
  if (room.mode !== 'tag' || room.matchOver) return
  const tag = room.tag
  const ghost = room.players[ghostId]
  const victim = room.players[victimId]
  if (!tag?.roundActive || !ghost || !victim) return
  if (ghost.team !== 'ghost' || victim.team !== 'hider') return
  victim.team = 'ghost'
  victim.hidden = false
  creditHide(room, victimId, now)
  delete tag.hideEnteredAt[victimId]
  delete tag.hideSpot[victimId]
  tag.caughtAt[victimId] = now
  tag.catches[ghostId] = (tag.catches[ghostId] ?? 0) + 1
  emitPlayerHidden(room, io, victimId)
  emitPlayerMoved(room, io, victimId)
  for (const id of Object.keys(room.players)) io.to(id).emit('tag:hud', tagHudFor(room, id, now))
  io.to(room.roomId).emit('combat:skill', { text: `${victim.name} 被抓到了，變成鬼` })
  announce(room, io, `${victim.name} 被抓到了，變成鬼`)
  const hidersLeft = presentPlayers(room).filter((p) => p.team === 'hider').length
  if (hidersLeft === 1) announce(room, io, '剩最後 1 人！')
  settleTag(room, io, now)
}

export function maybeRerollGhosts(room: TagRoom, io: Server, now: number) {
  settleTag(room, io, now)
  if (room.mode !== 'tag' || !room.tag?.roundActive || room.matchOver) return
  const live = presentPlayers(room).filter((p) => p.team !== 'spectator')
  const ghosts = live.filter((p) => p.team === 'ghost')
  if (ghosts.length > 0) return
  for (const p of Object.values(room.players)) {
    if (room.awayUntil?.[p.id] && p.team === 'ghost') p.team = 'spectator'
  }
  const hiders = live.filter((p) => p.team === 'hider')
  if (hiders.length < 2) {
    if (hiders.length === 1) endTag(room, io, 'hiders', now)
    return
  }
  const n = live.length >= 6 ? 2 : 1
  const pick = shuffle(hiders).slice(0, n)
  for (const p of pick) {
    p.team = 'ghost'
    p.hidden = false
    if (room.tag) {
      room.tag.catches[p.id] ??= 0
      delete room.tag.hideEnteredAt[p.id]
      delete room.tag.hideSpot[p.id]
    }
  }
  io.to(room.roomId).emit('combat:skill', { text: '鬼全部離開，重新抽鬼' })
}

export function resetPlayersForTagRestart(room: TagRoom) {
  const ids = Object.keys(room.players)
  ids.forEach((id, i) => {
    const p = room.players[id]
    const sp = spawnOf(room.scene, i)
    p.hp = PLAYER_MAX_HP
    p.hidden = false
    p.team = 'hider'
    p.seated = null
    p.position = [sp.x, sp.y, sp.z]
    p.rotationY = 0
  })
}

export function nearestHideSpot(x: number, z: number, range: number) {
  let best = null as (typeof HIDE_SPOTS)[number] | null
  let bestD = range
  for (const s of HIDE_SPOTS) {
    const d = Math.hypot(s.x - x, s.z - z)
    if (d <= bestD) {
      best = s
      bestD = d
    }
  }
  return best
}

function creditHide(room: TagRoom, playerId: string, now: number) {
  const at = room.tag?.hideEnteredAt[playerId]
  if (!at) return
  if (!room.hideMs) room.hideMs = {}
  room.hideMs[playerId] = (room.hideMs[playerId] ?? 0) + Math.max(0, now - at)
}

export function tryHide(room: TagRoom, playerId: string, want: boolean, now: number) {
  const player = room.players[playerId]
  const tag = room.tag
  if (!player) return false
  if (player.team === 'ghost' || player.team === 'spectator' || isDowned(player, now)) return false
  if (!want) {
    player.hidden = false
    if (tag) {
      creditHide(room, playerId, now)
      delete tag.hideEnteredAt[playerId]
      delete tag.hideSpot[playerId]
    }
    return true
  }
  if ((player.position[1] ?? 0) > HIDE_MAX_Y) return false
  const spot = nearestHideSpot(player.position[0], player.position[2], HIDE_RANGE)
  if (!spot) return false
  if (tag) {
    const cd = tag.hideCooldown[playerId]
    if (cd && cd.spotId === spot.id && now < cd.until) return false
    tag.hideEnteredAt[playerId] = now
    tag.hideSpot[playerId] = spot.id
  }
  player.hidden = true
  return true
}

export function handleCheck(room: TagRoom, io: Server, playerId: string, now: number) {
  if (room.mode !== 'tag' || room.matchOver) return
  const tag = room.tag
  const ghost = room.players[playerId]
  if (!tag?.roundActive || !ghost || ghost.team !== 'ghost') return
  if (now < tag.hideUntil) return
  if (now < (tag.nextCheck[playerId] ?? 0)) return
  const spot = nearestHideSpot(ghost.position[0], ghost.position[2], TAG_CHECK_RANGE)
  if (!spot) return
  tag.nextCheck[playerId] = now + TAG_CHECK_CD_MS
  for (const [hid, spotId] of Object.entries(tag.hideSpot)) {
    if (spotId !== spot.id) continue
    const victim = room.players[hid]
    if (victim?.hidden && victim.team === 'hider') catchHider(room, io, playerId, hid, now)
  }
  for (const p of presentPlayers(room)) {
    if (p.team !== 'hider' || !p.hidden) continue
    if (Math.hypot(p.position[0] - spot.x, p.position[2] - spot.z) <= HIDE_RANGE) {
      catchHider(room, io, playerId, p.id, now)
    }
  }
}

export function handleTagAttack(room: TagRoom, io: Server, playerId: string, now: number, attackerSocketId?: string) {
  const player = room.players[playerId]
  if (!player || player.seated || player.hidden) return
  if (isDowned(player, now)) return
  if (room.matchOver) return
  if ((room.nextAttack?.[playerId] ?? 0) > now) return
  if (!room.nextAttack) room.nextAttack = {}
  room.nextAttack[playerId] = now + ATTACK_COOLDOWN_MS
  if (!room.comboStep) room.comboStep = {}
  if (!room.lastSwingAt) room.lastSwingAt = {}
  const combo = nextComboStep(room.comboStep[playerId] ?? 0, room.lastSwingAt[playerId] ?? 0, now)
  room.comboStep[playerId] = combo
  room.lastSwingAt[playerId] = now
  const swing = attackerSocketId ? io.to(room.roomId).except(attackerSocketId) : io.to(room.roomId).except(playerId)
  swing.emit('player:swing', { id: playerId, combo })
  if (room.mode !== 'tag' || player.team !== 'ghost' || !room.tag?.roundActive) return
  if (now < room.tag.hideUntil) return
  for (const other of presentPlayers(room)) {
    if (other.team !== 'hider' || other.id === playerId) continue
    if (
      !meleeHits(
        player.position[0],
        player.position[2],
        player.rotationY,
        other.position[0],
        other.position[2],
        ATTACK_RANGE,
      )
    ) {
      continue
    }
    catchHider(room, io, playerId, other.id, now)
    return
  }
}

export function tickTag(room: TagRoom, io: Server, now: number) {
  if (room.mode !== 'tag' || room.matchOver) return
  const tag = room.tag
  if (!tag?.roundActive) return

  for (const [id, at] of Object.entries(tag.hideEnteredAt)) {
    const p = room.players[id]
    if (!p?.hidden) continue
    if (now - at < TAG_BOX_MAX_MS) continue
    const spotId = tag.hideSpot[id]
    p.hidden = false
    creditHide(room, id, now)
    tag.hideCooldown[id] = { spotId, until: now + TAG_BOX_REENTER_MS }
    delete tag.hideEnteredAt[id]
    delete tag.hideSpot[id]
    emitPlayerHidden(room, io, id)
    io.to(id).emit('combat:skill', { text: '藏太久，被趕出箱子' })
  }

  if (!tag.opened && now >= tag.hideUntil) {
    tag.opened = true
    for (const p of Object.values(room.players)) emitPlayerMoved(room, io, p.id)
    for (const id of Object.keys(room.players)) {
      io.to(id).emit('tag:hud', tagHudFor(room, id, now))
    }
    io.to(room.roomId).emit('combat:skill', { text: '藏身結束，鬼出發' })
  }

  if (now >= tag.hideUntil) {
    const live = presentPlayers(room)
    for (const ghost of live.filter((p) => p.team === 'ghost')) {
      for (const hider of live.filter((p) => p.team === 'hider')) {
        const dist = Math.hypot(ghost.position[0] - hider.position[0], ghost.position[2] - hider.position[2])
        if (dist <= TAG_TOUCH) catchHider(room, io, ghost.id, hider.id, now)
      }
    }
  }

  settleTag(room, io, now)
}

export function acceptMove(
  room: TagRoom,
  player: PlayerState,
  payload: { position: Vec3; rotationY: number },
  now: number,
) {
  if (isDowned(player, now)) return false
  if (player.team === 'ghost' && hidePhase(room, now)) return false
  if (!room.lastMoveAt) room.lastMoveAt = {}
  if (!room.moveGrant) room.moveGrant = {}
  if (!Array.isArray(payload.position) || payload.position.length < 3) return false
  const [x, rawY, z] = payload.position
  if (![x, rawY, z, payload.rotationY].every((n) => typeof n === 'number' && Number.isFinite(n))) return false

  const grant = room.moveGrant[player.id]
  const jumping = Boolean(grant?.jumpUntil && now <= grant.jumpUntil)
  const prevY = player.position[1] ?? 0
  const platforms = platformsOf(room.scene)
  const nav = heightFieldOf(room.scene)
  const px = player.position[0]
  const pz = player.position[2]
  if (nav && !canMoveTo(nav, px, pz, x, z, PLAYER_FOOT_RADIUS, jumping ? prevY : undefined, jumping ? rawY : undefined)) return false
  const terrain = nav ? (groundY(nav, x, z) ?? 0) : 0
  const startT = nav ? (groundY(nav, px, pz) ?? prevY) : 0
  const floor = supportY(x, z, rawY, prevY, PLAYER_FOOT_RADIUS, platforms, terrain)
  let y = rawY
  const ceiling = jumpCeilingFor(room.scene)
  if (!jumping && y > floor + JUMP_GROUND_EPS) {
    const falling = Boolean(nav) && y < startT - 0.05 && y + 0.2 >= terrain
    if (!falling) y = floor
  }
  if (nav) {
    const low = Math.min(startT, terrain)
    const high = Math.max(startT, terrain)
    if (y > high + ceiling + 0.2 || y < low - 0.25) return false
  } else if (y > ceiling + 0.2 || y < -0.08) return false

  const slowed = now < (room.poopSlowUntil?.[player.id] ?? 0)
  const prev = room.lastMoveAt[player.id]
  // 垂直仍看距離上一筆接受的時間。水平改記在預算裡，連發的合法步伐一起扣。
  const elapsed = prev == null ? 0 : now - prev
  const allow = moveAllowance(elapsed, grant, now, { poopSlow: slowed })
  const dist = Math.hypot(x - player.position[0], z - player.position[2])
  const rise = y - prevY
  const drop = prevY - y
  if (nav) {
    const terrainRise = Math.max(0, terrain - startT)
    const terrainDrop = Math.max(0, startT - terrain)
    if (rise > allow.vert + terrainRise + 0.08) return false
    if (drop > JUMP_MAX_DELTA + MOVE_Y_PAD + terrainDrop) return false
  } else if (rise > allow.vert || drop > JUMP_MAX_DELTA + MOVE_Y_PAD) return false

  if (!room.moveBank) room.moveBank = {}
  let bank = room.moveBank[player.id]
  if (!bank || (prev != null && prev > bank.accruedAt)) {
    bank = { accruedAt: prev ?? now, walk: 0, dash: 0, pad: false }
    room.moveBank[player.id] = bank
  }
  if (now >= bank.accruedAt) {
    const rate = slowed ? PLAYER_SPEED * POOP_SLOW_MUL : PLAYER_SPEED * MOVE_SLACK
    const pad = slowed ? 0.08 : MOVE_PAD
    const cap = rate * MOVE_DT_CAP_SEC + pad
    let gain = rate * cappedMoveDt(now - bank.accruedAt)
    if (!bank.pad) {
      gain += pad
      bank.pad = true
    }
    bank.walk = Math.min(cap, bank.walk + gain)
    bank.accruedAt = now
  }
  if (grant?.dashUntil && now <= grant.dashUntil && bank.dashMark !== grant.dashUntil) {
    bank.dash += DASH_DISTANCE * MOVE_SLACK
    bank.dashMark = grant.dashUntil
  }
  if (dist > bank.walk + bank.dash) return false
  let rest = dist
  const fromWalk = Math.min(bank.walk, rest)
  bank.walk -= fromWalk
  rest -= fromWalk
  bank.dash = Math.max(0, bank.dash - rest)

  player.position = [x, y, z]
  player.rotationY = payload.rotationY
  room.lastMoveAt[player.id] = now
  return true
}
