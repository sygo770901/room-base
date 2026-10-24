/**
 * 低幀率 1–2 秒才送一次、單步 6–10 公尺：沿方向收到允許距離，不拉回出生點。
 * 20 公尺以上的瞬移仍整包拒絕。
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as ioClient, type Socket } from 'socket.io-client'
import { acceptMove, recordMoveOrigin, type TagRoom } from '../server/tag.ts'
import { attachSocketServer } from '../server/socket.ts'
import { groundY } from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import { MOVE_DT_CAP_SEC, MOVE_PAD, MOVE_SLACK, PLAYER_SPEED } from '../shared/movement.ts'
import { lobbySceneIds, type SceneId } from '../shared/scenes.ts'
import { canMoveTo } from '../shared/heightfield.ts'
import { samplePathClear } from '../shared/sampleCollision.ts'
import { sceneMoveArgs } from '../shared/sceneMotion.ts'
import { PLAYER_RADIUS } from '../shared/furniture.ts'
import { PLAYER_FOOT_RADIUS } from '../shared/platforms.ts'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import type { PlayerState } from '../server/types.ts'

const CAP = PLAYER_SPEED * MOVE_DT_CAP_SEC * MOVE_SLACK + MOVE_PAD
const CASES: { scene: SceneId; gap: number; jump: number }[] = [
  { scene: 'kenney', gap: 1000, jump: 6 },
  { scene: 'kenney', gap: 1200, jump: 7 },
  { scene: 'kenney', gap: 1400, jump: 8 },
  { scene: 'kenney', gap: 1600, jump: 9 },
  { scene: 'kenney', gap: 2000, jump: 10 },
]

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function playerAt(position: [number, number, number]): PlayerState {
  return {
    id: 'p',
    name: '測',
    color: '#fff',
    classId: 'ranger',
    position,
    rotationY: 0,
    seated: null,
    role: 'host',
    hp: 100,
    team: 'hider',
  }
}

function roomAt(scene: string, p: PlayerState): TagRoom {
  return {
    roomId: `catch-${scene}`,
    mode: 'tag',
    scene,
    players: { p },
    lastMoveAt: {},
    moveGrant: {},
    moveBank: {},
  }
}

function pathClear(scene: string, x0: number, z0: number, x1: number, z1: number) {
  const nav = heightFieldOf(scene)
  if (nav && !canMoveTo(nav, x0, z0, x1, z1, PLAYER_FOOT_RADIUS)) return false
  if (nav?.id === 'sample' && !samplePathClear(x0, z0, x1, z1, PLAYER_FOOT_RADIUS)) return false
  if (!nav) {
    const args = sceneMoveArgs(scene)
    const slid = resolvePlayerMove(x0, z0, x1 - x0, z1 - z0, [], PLAYER_RADIUS, args.extra, 0, args.platforms, null)
    if (Math.hypot(slid.x - x1, slid.z - z1) > 0.05) return false
  }
  return true
}

function clearHeading(scene: string, x: number, z: number, jump: number): [number, number] {
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
  ]
  for (const [dx, dz] of dirs) {
    if (pathClear(scene, x, z, x + dx * jump, z + dz * jump)) return [dx, dz]
  }
  throw new Error(`${scene} 從 ${x.toFixed(1)},${z.toFixed(1)} 沒有 ${jump}m 走得通的方向`)
}

function unitCatch(scene: string, gap: number, jump: number) {
  const home = spawnOf(scene, 0)
  const [dx, dz] = clearHeading(scene, home.x, home.z, jump)
  const p = playerAt([home.x, home.y, home.z])
  const room = roomAt(scene, p)
  const t0 = 4_000_000
  recordMoveOrigin(room, p.id, t0)
  const tx = home.x + dx * jump
  const tz = home.z + dz * jump
  const ty = heightFieldOf(scene) ? (groundY(heightFieldOf(scene), tx, tz) ?? home.y) : 0
  const ok = acceptMove(room, p, { position: [tx, ty, tz], rotationY: 0.2 }, t0 + gap)
  const moved = Math.hypot(p.position[0] - home.x, p.position[2] - home.z)
  assert(ok, `${scene} ${gap}ms 後 ${jump}m 不該整包拒絕`)
  assert(moved > 4.5, `${scene} 被拉回出生點附近，只走了 ${moved.toFixed(2)}m`)
  assert(Math.abs(moved - CAP) < 0.25, `${scene} 應收到約 ${CAP.toFixed(2)}m，實際 ${moved.toFixed(2)}m`)
  assert(moved < jump - 0.2, `${scene} 不該一次收下 ${jump}m，實際 ${moved.toFixed(2)}m`)
  const again = acceptMove(room, p, { position: [tx, ty, tz], rotationY: 0.2 }, t0 + gap + 1000)
  const landed = Math.hypot(p.position[0] - tx, p.position[2] - tz)
  assert(again && landed < 0.3, `${scene} 下一包應追到回報點，還差 ${landed.toFixed(2)}m`)
  const before: [number, number, number] = [p.position[0], p.position[1], p.position[2]]
  const tele = acceptMove(
    room,
    p,
    { position: [before[0] + dx * 25, before[1], before[2] + dz * 25], rotationY: 0.2 },
    t0 + gap + 1000,
  )
  assert(!tele, `${scene} 25m 瞬移不該接受`)
  assert(
    p.position[0] === before[0] && p.position[2] === before[2],
    `${scene} 瞬移被拒後應留在追趕點`,
  )
}

for (const scene of lobbySceneIds(false)) {
  for (const trial of CASES) unitCatch(scene, trial.gap, trial.jump)
}

{
  const p = playerAt([78, 0, 34])
  const room = roomAt('kenney', p)
  room.lastMoveAt = { p: 8_000_000 }
  const tele = acceptMove(room, p, { position: [78, 0, 54], rotationY: 0 }, 8_000_000 + 60_000)
  assert(!tele && p.position[2] === 34, '站很久後 20m 仍應拒絕')
  const cheat = playerAt([78, 0, 34])
  const cheatRoom = roomAt('kenney', cheat)
  cheatRoom.lastMoveAt = { p: 9_000_000 }
  const dash = acceptMove(cheatRoom, cheat, { position: [78, 0, 38], rotationY: 0 }, 9_000_000 + 200)
  assert(!dash && cheat.position[2] === 34, '200ms 走 4m 仍應整包拒絕')
}

type Pos = [number, number, number]
type Snap = { scene?: string; players: Record<string, { position?: Pos }> }

function connect(url: string, roomId: string, name: string, scene: string, wantHost: boolean) {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true })
  const playerId = crypto.randomUUID()
  const secret = crypto.randomUUID()
  return new Promise<{ socket: Socket; playerId: string; snap: Snap }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} 連線逾時`)), 5000)
    socket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.on('connect', () => {
      socket.emit(
        'join',
        { roomId, name, wantHost, scene, mode: 'tag', playerId, secret },
        (snap: Snap & { error?: string }) => {
          clearTimeout(timer)
          if (snap?.error) reject(new Error(snap.error))
          else resolve({ socket, playerId, snap })
        },
      )
    })
  })
}

async function liveJoin(url: string, scene: SceneId, n: number, gap: number, jump: number, sockets: Socket[]) {
  const roomId = `catch-${scene}-${n}-${Date.now()}`
  const host = await connect(url, roomId, '甲', scene, true)
  const watch = await connect(url, roomId, '乙', scene, false)
  sockets.push(host.socket, watch.socket)
  const spawn = host.snap.players[host.playerId]?.position
  assert(spawn != null, `${scene}#${n} 沒有出生點`)
  const [dx, dz] = clearHeading(scene, spawn[0], spawn[2], jump)
  const tx = spawn[0] + dx * jump
  const tz = spawn[2] + dz * jump
  const field = heightFieldOf(scene)
  const ty = field ? (groundY(field, tx, tz) ?? spawn[1]) : 0
  const snaps: Pos[] = []
  const seen: Pos[] = []
  host.socket.on('player:moved', (payload: { id?: string; snap?: boolean; position?: Pos }) => {
    if (payload.id === host.playerId && payload.snap && payload.position) snaps.push(payload.position)
  })
  watch.socket.on('player:moved', (payload: { id?: string; snap?: boolean; position?: Pos }) => {
    if (payload.id === host.playerId && payload.position) seen.push(payload.position)
  })
  await sleep(gap)
  host.socket.emit('move', { position: [tx, ty, tz], rotationY: 0.2, loco: 'run' })
  await sleep(120)
  const first = seen.at(-1)
  assert(first != null, `${scene}#${n} 看不到第一步`)
  const moved = Math.hypot(first[0] - spawn[0], first[2] - spawn[2])
  assert(snaps.length === 0, `${scene}#${n} 低幀率步伐被拉回 ${snaps[0]?.[0].toFixed(1)},${snaps[0]?.[2].toFixed(1)}`)
  assert(moved > 4.5, `${scene}#${n} 停在出生點附近 ${moved.toFixed(2)}m`)
  assert(Math.abs(moved - CAP) < 0.35, `${scene}#${n} 應沿方向收到約 ${CAP.toFixed(2)}m，實際 ${moved.toFixed(2)}m`)
  assert(moved < jump - 0.15, `${scene}#${n} 一次收下了 ${jump}m`)
  await sleep(1000)
  host.socket.emit('move', { position: [tx, ty, tz], rotationY: 0.2, loco: 'run' })
  await sleep(120)
  const second = seen.at(-1)
  assert(second != null, `${scene}#${n} 看不到追趕`)
  const left = Math.hypot(second[0] - tx, second[2] - tz)
  assert(snaps.length === 0, `${scene}#${n} 追趕時被拉回`)
  assert(left < 0.35, `${scene}#${n} 追趕後還差 ${left.toFixed(2)}m，沒貼到回報點`)
  const teleX = second[0] + dx * 25
  const teleZ = second[2] + dz * 25
  host.socket.emit('move', { position: [teleX, second[1], teleZ], rotationY: 0.2, loco: 'run' })
  await sleep(120)
  assert(snaps.length === 1, `${scene}#${n} 瞬移應拒絕並校正一次，實際 ${snaps.length}`)
  const back = Math.hypot(snaps[0][0] - second[0], snaps[0][2] - second[2])
  const fromSpawn = Math.hypot(snaps[0][0] - spawn[0], snaps[0][2] - spawn[2])
  assert(back < 0.35, `${scene}#${n} 瞬移校正不在追趕點`)
  assert(fromSpawn > 4.5, `${scene}#${n} 瞬移把人拉回出生點`)
}

async function main() {
  const httpServer = createServer()
  attachSocketServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = (httpServer.address() as AddressInfo).port
  const url = `http://127.0.0.1:${port}`
  const sockets: Socket[] = []
  try {
    await Promise.all(
      lobbySceneIds(false).map(async (scene) => {
        for (let i = 0; i < CASES.length; i++) {
          const trial = CASES[i]
          await liveJoin(url, scene, i, trial.gap, trial.jump, sockets)
        }
      }),
    )
    console.log('move-catchup: ok', { cap: Number(CAP.toFixed(3)), joins: CASES.length, maps: lobbySceneIds(false).join(',') })
  } finally {
    for (const socket of sockets) socket.close()
    await Promise.race([
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
      sleep(1500),
    ])
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
