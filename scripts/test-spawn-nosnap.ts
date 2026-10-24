/**
 * 進房後立刻走，前 10 秒不能被拉回出生點。第二個人進來也不能把第一個人送回去。
 * 換到還沒走過的圖仍會放到該圖出生點。已經在走的人，晚到的場景設定不能再拉回。
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as ioClient, type Socket } from 'socket.io-client'
import { attachSocketServer } from '../server/socket.ts'
import { groundY } from '../shared/heightfield.ts'
import { heightFieldOf, spawnOf } from '../shared/heightmaps.ts'
import { lobbySceneIds, type SceneId } from '../shared/scenes.ts'

const MAPS = lobbySceneIds(false)
const JOINS = 5
const WALK_MS = 10_000
const STEP = 0.22

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Pos = [number, number, number]
type Snap = {
  error?: string
  scene?: string
  hostId?: string | null
  players: Record<string, { id: string; position?: Pos }>
}

function dist(a: Pos, b: Pos) {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

function foot(scene: string, x: number, z: number) {
  const field = heightFieldOf(scene)
  if (!field) return 0
  return groundY(field, x, z) ?? 0
}

function connect(
  url: string,
  roomId: string,
  name: string,
  scene: string,
  wantHost: boolean,
  identity?: { playerId: string; secret: string },
) {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true })
  const playerId = identity?.playerId ?? crypto.randomUUID()
  const secret = identity?.secret ?? crypto.randomUUID()
  return new Promise<{ socket: Socket; playerId: string; secret: string; snap: Snap }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} 連線逾時`)), 5000)
    socket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.on('connect', () => {
      socket.emit(
        'join',
        { roomId, name, wantHost, scene, mode: 'tag', playerId, secret },
        (snap: Snap) => {
          clearTimeout(timer)
          if (snap?.error) reject(new Error(snap.error))
          else resolve({ socket, playerId, secret, snap })
        },
      )
    })
  })
}

function once<T>(socket: Socket, event: string, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等不到 ${event}`)), ms)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function onceSnap(socket: Socket, selfId: string, ms: number) {
  return new Promise<{ position: Pos }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等不到換圖後的座標')), ms)
    const onMove = (payload: { id?: string; snap?: boolean; position?: Pos }) => {
      if (payload.id !== selfId || !payload.snap || !payload.position) return
      clearTimeout(timer)
      socket.off('player:moved', onMove)
      resolve({ position: payload.position })
    }
    socket.on('player:moved', onMove)
  })
}

function moveTo(socket: Socket, selfId: string, scene: string, x: number, z: number, spawn: Pos, away: number) {
  const y = foot(scene, x, z)
  return new Promise<Pos>((resolve, reject) => {
    let done = false
    const onMove = (payload: { id?: string; snap?: boolean; position?: Pos }) => {
      if (payload.id !== selfId || !payload.snap || !payload.position) return
      finish(payload.position)
    }
    const timer = setTimeout(() => finish([x, y, z]), 100)
    function finish(pos: Pos) {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.off('player:moved', onMove)
      if (away > 1.2 && dist(pos, spawn) < 0.75) {
        reject(new Error(`${scene} 走到 ${away.toFixed(2)}m 後被拉回出生點 ${pos[0].toFixed(1)},${pos[2].toFixed(1)}`))
        return
      }
      resolve(pos)
    }
    socket.on('player:moved', onMove)
    socket.emit('move', { position: [x, y, z], rotationY: 0, loco: 'walk' })
  })
}

async function walkFor(socket: Socket, selfId: string, scene: string, spawn: Pos, ms: number) {
  const dirs = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ]
  const started = Date.now()
  let pos: Pos = [spawn[0], spawn[1], spawn[2]]
  let dir = dirs[0]
  let opened = false
  for (const candidate of dirs) {
    const next = await moveTo(
      socket,
      selfId,
      scene,
      pos[0] + candidate[0] * STEP,
      pos[2] + candidate[1] * STEP,
      spawn,
      dist(pos, spawn),
    )
    if (dist(next, pos) < 0.05) continue
    dir = candidate
    pos = next
    opened = true
    break
  }
  assert(opened, `${scene} 出生點附近走不出去`)
  let announced = false
  let sign = 1
  while (Date.now() - started < ms || dist(pos, spawn) < 1.5) {
    if (Date.now() - started > ms + 4000) break
    if (!announced && Date.now() - started > 3400) {
      announced = true
      socket.emit('scene:set', { scene })
    }
    const ahead = dist(pos, spawn)
    if (ahead > 2.6) sign = -1
    else if (ahead < 1.35) sign = 1
    const next = await moveTo(
      socket,
      selfId,
      scene,
      pos[0] + dir[0] * STEP * sign,
      pos[2] + dir[1] * STEP * sign,
      spawn,
      ahead,
    )
    if (dist(next, pos) < 0.05) sign *= -1
    else pos = next
  }
  assert(dist(pos, spawn) > 1.2, `${scene} 走完後又回到出生點 ${pos[0].toFixed(1)},${pos[2].toFixed(1)}`)
  return pos
}

async function trial(url: string, scene: SceneId, n: number, sockets: Socket[]) {
  const roomId = `nosnap-${scene}-${n}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const host = await connect(url, roomId, '甲', scene, true)
  sockets.push(host.socket)
  const me = host.snap.players[host.playerId]
  assert(host.snap.scene === scene, `${scene} 進房場景是 ${host.snap.scene}`)
  assert(Array.isArray(me?.position), `${scene} 進房沒有座標`)
  const spawn = me.position as Pos
  const home = spawnOf(scene, 0)
  assert(dist(spawn, [home.x, home.y, home.z]) < 0.2, `${scene} 出生點不是 ${home.x},${home.z}`)
  const walked = await walkFor(host.socket, host.playerId, scene, spawn, WALK_MS)
  const guestScene = scene === 'kenney' ? 'kaykit' : 'kenney'
  const hostView = once<Snap>(host.socket, 'room:state', 2000)
  const guest = await connect(url, roomId, '乙', guestScene, false)
  sockets.push(guest.socket)
  assert(guest.snap.scene === scene, `${scene} 第二個人把場景改成 ${guest.snap.scene}`)
  const hostNow = (await hostView).players[host.playerId]?.position
  assert(hostNow != null, `${scene} 第二個人看不到第一個人`)
  assert(
    dist(hostNow, walked) < 0.6,
    `${scene}#${n} 第二個人進房把第一個人從 ${walked[0].toFixed(1)},${walked[2].toFixed(1)} 送到 ${hostNow[0].toFixed(1)},${hostNow[2].toFixed(1)}`,
  )
  assert(dist(hostNow, spawn) > 1.2, `${scene}#${n} 第一個人被拉回出生點`)
}

async function mapChangeStillSpawns(url: string, sockets: Socket[]) {
  const host = await connect(url, `nosnap-change-${Date.now()}`, '換圖', 'kenney', true)
  sockets.push(host.socket)
  const spawn = host.snap.players[host.playerId].position as Pos
  await walkFor(host.socket, host.playerId, 'kenney', spawn, 300)
  await sleep(120)
  const moved = onceSnap(host.socket, host.playerId, 2000)
  host.socket.emit('scene:set', { scene: 'sample' })
  const snap = await moved
  const sample = spawnOf('sample', 0)
  assert(
    dist(snap.position, [sample.x, sample.y, sample.z]) < 0.3,
    `換到沒走過的圖應送到出生點，實際 ${snap.position[0].toFixed(1)},${snap.position[2].toFixed(1)}`,
  )
}

async function lateSceneSetup(url: string, sockets: Socket[]) {
  const roomId = `nosnap-late-${Date.now()}`
  const host = await connect(url, roomId, '晚到', 'sample', true)
  sockets.push(host.socket)
  const spawn = host.snap.players[host.playerId].position as Pos
  const walked = await walkFor(host.socket, host.playerId, 'sample', spawn, 300)
  host.socket.disconnect()
  await sleep(250)
  const guest = await connect(url, roomId, '後來', 'kaykit', true)
  sockets.push(guest.socket)
  assert(guest.snap.scene === 'kaykit', `斷線後進房應能換圖，實際 ${guest.snap.scene}`)
  assert(guest.snap.hostId === guest.playerId, '後來的人應成為房主')
  const still = guest.snap.players[host.playerId]?.position
  assert(still != null, '斷線的人應還在房裡')
  assert(
    dist(still, walked) < 0.6,
    `第二個人進房就把人從 ${walked[0].toFixed(1)},${walked[2].toFixed(1)} 送到 ${still[0].toFixed(1)},${still[2].toFixed(1)}`,
  )
  await sleep(150)
  const state = once<Snap>(guest.socket, 'room:state', 2000)
  guest.socket.emit('scene:set', { scene: 'sample' })
  const after = await state
  assert(after.scene === 'sample', `晚到的場景設定沒換成寶物房，實際 ${after.scene}`)
  const backJoin = await connect(url, roomId, '晚到', 'sample', false, {
    playerId: host.playerId,
    secret: host.secret,
  })
  sockets.push(backJoin.socket)
  const back = backJoin.snap.players[host.playerId]?.position
  assert(back != null, '換回寶物房後看不到原本的人')
  assert(
    dist(back, walked) < 0.6,
    `晚到的場景設定把已在走的人從 ${walked[0].toFixed(1)},${walked[2].toFixed(1)} 拉回 ${back[0].toFixed(1)},${back[2].toFixed(1)}`,
  )
  assert(dist(back, spawn) > 1.2, '換回寶物房後被拉回出生點')
}

async function main() {
  assert(MAPS.join(',') === 'kenney,kaykit,jungle,sample', `大廳圖不對 ${MAPS.join(',')}`)
  const httpServer = createServer()
  attachSocketServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = (httpServer.address() as AddressInfo).port
  const url = `http://127.0.0.1:${port}`
  const sockets: Socket[] = []
  try {
    await Promise.all(
      MAPS.map(async (scene) => {
        for (let n = 0; n < JOINS; n++) await trial(url, scene, n, sockets)
      }),
    )
    await mapChangeStillSpawns(url, sockets)
    await lateSceneSetup(url, sockets)

    delete process.env.NODE_ENV
    const dev = await connect(url, `nosnap-dev-${Date.now()}`, '開發', 'heightlab', true)
    sockets.push(dev.socket)
    assert(dev.snap.scene === 'heightlab', `開發環境應接受 heightlab，實際 ${dev.snap.scene}`)

    process.env.NODE_ENV = 'production'
    const prod = await connect(url, `nosnap-prod-${Date.now()}`, '正式', 'heightlab', true)
    sockets.push(prod.socket)
    assert(prod.snap.scene !== 'heightlab', `正式環境不該進 heightlab，實際 ${prod.snap.scene}`)
    assert(prod.snap.scene === 'kenney', `正式環境拒絕 heightlab 後應留在預設圖，實際 ${prod.snap.scene}`)
    await sleep(100)
    const echoed = once<Snap>(prod.socket, 'room:state', 2000)
    prod.socket.emit('scene:set', { scene: 'heightlab' })
    prod.socket.emit('phrase', { index: 0 })
    const after = await echoed
    assert(after.scene !== 'heightlab', '正式環境 scene:set heightlab 不該生效')
    console.log('spawn-nosnap: ok', { port, maps: MAPS.join(','), joins: JOINS })
  } finally {
    delete process.env.NODE_ENV
    for (const socket of sockets) socket.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
