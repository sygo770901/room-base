import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as ioClient, type Socket } from 'socket.io-client'
import { attachSocketServer } from '../server/socket.ts'
import { groundY } from '../shared/heightfield.ts'
import { heightFieldOf } from '../shared/heightmaps.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Snap = {
  selfId?: string
  players: Record<string, { id: string; team?: string; position?: [number, number, number] }>
  tagHud?: { hideLeftMs: number; team?: string | null } | null
  monsters?: { id: string; x: number; z: number; y?: number; model: string }[]
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

function connect(url: string, roomId: string, name: string, mode: 'hunt' | 'tag', wantHost: boolean) {
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
        { roomId, name, wantHost, scene: 'heightlab', mode, playerId, secret },
        (snap: Snap & { error?: string }) => {
          clearTimeout(timer)
          if (snap?.error) reject(new Error(snap.error))
          else resolve({ socket, playerId, snap })
        },
      )
    })
  })
}

function move(socket: Socket, selfId: string, position: [number, number, number]) {
  return new Promise<'ok' | 'snap'>((resolve) => {
    const onMove = (payload: { id?: string; snap?: boolean }) => {
      if (payload.id !== selfId || !payload.snap) return
      clearTimeout(timer)
      socket.off('player:moved', onMove)
      resolve('snap')
    }
    const timer = setTimeout(() => {
      socket.off('player:moved', onMove)
      resolve('ok')
    }, 80)
    socket.on('player:moved', onMove)
    socket.emit('move', { position, rotationY: 0 })
  })
}

async function walkVia(socket: Socket, selfId: string, from: [number, number, number], points: { x: number; z: number }[]) {
  let pos = from
  for (const point of points) pos = await walk(socket, selfId, pos, point.x, point.z)
  return pos
}

async function walk(socket: Socket, selfId: string, from: [number, number, number], x: number, z: number) {
  const field = heightFieldOf('heightlab')
  if (!field) throw new Error('heightlab')
  const dx = x - from[0]
  const dz = z - from[2]
  const dist = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(dist / 0.28))
  let pos = from
  for (let i = 1; i <= steps; i++) {
    const nx = from[0] + (dx * i) / steps
    const nz = from[2] + (dz * i) / steps
    const gy = groundY(field, nx, nz)
    if (gy == null) throw new Error(`路徑走進牆 ${nx.toFixed(2)},${nz.toFixed(2)}`)
    const result = await move(socket, selfId, [nx, gy, nz])
    if (result === 'snap') throw new Error(`伺服器拒絕移動到 ${nx.toFixed(2)},${gy.toFixed(2)},${nz.toFixed(2)}`)
    pos = [nx, gy, nz]
  }
  return pos
}

function sees(snap: Snap, otherId: string) {
  const other = snap.players[otherId]
  return Array.isArray(other?.position)
}

async function freshState(a: Socket, b: Socket | null) {
  const waitA = once<Snap>(a, 'room:state', 4000)
  const waitB = b ? once<Snap>(b, 'room:state', 4000) : null
  a.emit('phrase', { index: 0 })
  return { a: await waitA, b: waitB ? await waitB : null }
}

async function main() {
  const field = heightFieldOf('heightlab')
  assert(field != null, 'heightlab')
  const httpServer = createServer()
  attachSocketServer(httpServer)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = (httpServer.address() as AddressInfo).port
  const url = `http://127.0.0.1:${port}`
  const sockets: Socket[] = []
  try {
    const huntId = `hl-hunt-${Date.now()}`
    const host = await connect(url, huntId, '房主', 'hunt', true)
    sockets.push(host.socket)
    const me = host.snap.players[host.playerId]
    assert(Array.isArray(me?.position), '進房沒有自己的座標')
    const onPlatform = await walkVia(host.socket, host.playerId, me.position, [
      { x: 14, z: me.position[2] },
      { x: 14, z: 20 },
      { x: 11, z: 20 },
    ])
    assert(Math.abs(onPlatform[1] - 4) < 0.2, `玩家該站在高台，y=${onPlatform[1]}`)
    let climbed = false
    let last = ''
    const deadline = Date.now() + 18000
    while (Date.now() < deadline) {
      const list = await once<{ x: number; z: number; y?: number; model: string }[]>(host.socket, 'monsters:sync', 2000)
      const knight = list[0]
      if (!knight) continue
      last = `${knight.x.toFixed(1)},${(knight.y ?? 0).toFixed(2)},${knight.z.toFixed(1)}`
      const dist = Math.hypot(knight.x - 11, knight.z - 20)
      if ((knight.y ?? 0) > 3 && dist < 2.5) {
        climbed = true
        break
      }
    }
    assert(climbed, `怪物該沿著樓梯追到高台上的玩家，最後 ${last}`)

    const tagId = `hl-tag-${Date.now()}`
    const ghostHost = await connect(url, tagId, '甲', 'tag', true)
    const hiderGuest = await connect(url, tagId, '乙', 'tag', false)
    sockets.push(ghostHost.socket, hiderGuest.socket)
    await sleep(200)
    const started = once<Snap>(ghostHost.socket, 'room:state', 4000)
    ghostHost.socket.emit('match:start')
    const startSnap = await started
    const hideLeft = startSnap.tagHud?.hideLeftMs ?? 0
    assert(hideLeft > 0, '鬼抓人開局應有藏身時間')
    const byId = startSnap.players
    const ghostId = Object.values(byId).find((p) => p.team === 'ghost')?.id
    const hiderId = Object.values(byId).find((p) => p.team === 'hider')?.id
    assert(ghostId != null && hiderId != null, '開局應抽出鬼和躲藏者')
    const ghostSock = ghostId === ghostHost.playerId ? ghostHost.socket : hiderGuest.socket
    const hiderSock = hiderId === ghostHost.playerId ? ghostHost.socket : hiderGuest.socket
    await sleep(hideLeft + 500)
    const open = await freshState(ghostSock, hiderSock)
    assert(sees(open.a, hiderId) && sees(open.b!, ghostId), '同一層、沒有樓板擋住時，雙方都該看得到對方')

    const hiderPos = byId[hiderId].position
    const ghostPos = byId[ghostId].position
    assert(hiderPos != null && ghostPos != null, '開局座標')
    await walkVia(hiderSock, hiderId, hiderPos, [
      { x: 14, z: hiderPos[2] },
      { x: 14, z: 28 },
    ])
    await walkVia(ghostSock, ghostId, ghostPos, [
      { x: 14, z: ghostPos[2] },
      { x: 14, z: 20 },
      { x: 11, z: 20 },
    ])
    await sleep(2100)
    const split = await freshState(ghostSock, hiderSock)
    assert(!sees(split.a, hiderId), '鬼在高台不該看到樓板下的玩家')
    assert(!sees(split.b!, ghostId), '樓板下的玩家不該看到高台上的鬼')
    console.log('height-live: ok', { port, monster: last })
  } finally {
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
