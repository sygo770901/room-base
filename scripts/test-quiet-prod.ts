import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as ioClient, type Socket } from 'socket.io-client'
import { clientSendsQuiet, serverAcceptsQuiet } from '../shared/quiet.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(!serverAcceptsQuiet(true, 'production'), '正式環境要忽略 quiet:true')
assert(serverAcceptsQuiet(true, 'development'), '開發環境仍接受 quiet')
assert(serverAcceptsQuiet(true, undefined), '沒設 NODE_ENV 時開發用的 quiet 仍有效')
assert(!serverAcceptsQuiet(false, 'development'), '沒帶 quiet 不該關掉怪物')
assert(!clientSendsQuiet(true, '?shot=1'), '正式打包不送 quiet')
assert(!clientSendsQuiet(true, ''), '正式打包沒有 shot 也不送')
assert(clientSendsQuiet(false, '?shot=1'), '開發環境的 ?shot=1 才送 quiet')
assert(!clientSendsQuiet(false, ''), '開發環境沒有 shot 不送 quiet')

type Mob = { id: string; kind?: string; name?: string }
type Snap = { error?: string; monsters?: Mob[] }

function join(url: string, roomId: string, mode: 'hunt' | 'boss', scene: string, quiet: boolean) {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true })
  const playerId = crypto.randomUUID()
  const secret = crypto.randomUUID()
  return new Promise<{ socket: Socket; snap: Snap }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${mode} 連線逾時`)), 5000)
    socket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    socket.on('connect', () => {
      socket.emit(
        'join',
        { roomId, name: mode, wantHost: true, scene, mode, playerId, secret, quiet },
        (snap: Snap) => {
          clearTimeout(timer)
          if (snap?.error) reject(new Error(snap.error))
          else resolve({ socket, snap })
        },
      )
    })
  })
}

process.env.NODE_ENV = 'production'
const { attachSocketServer } = await import('../server/socket.ts')
const httpServer = createServer()
attachSocketServer(httpServer)
await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
const port = (httpServer.address() as AddressInfo).port
const url = `http://127.0.0.1:${port}`
const sockets: Socket[] = []

try {
  const hunt = await join(url, `quiet-hunt-${Date.now()}`, 'hunt', 'heightlab', true)
  sockets.push(hunt.socket)
  const knight = (hunt.snap.monsters ?? []).some((m) => m.id === 'knight')
  assert(knight, `正式環境 quiet:true 仍要生出騎士，實際 ${JSON.stringify(hunt.snap.monsters)}`)

  const boss = await join(url, `quiet-boss-${Date.now()}`, 'boss', 'kaykit', true)
  sockets.push(boss.socket)
  const duck = (boss.snap.monsters ?? []).some((m) => m.id === 'duck-king' || m.kind === 'duck-king')
  assert(duck, `正式環境 quiet:true 仍要生出鴨王，實際 ${JSON.stringify(boss.snap.monsters)}`)

  process.env.NODE_ENV = 'development'
  const dev = await join(url, `quiet-dev-${Date.now()}`, 'hunt', 'heightlab', true)
  sockets.push(dev.socket)
  assert((dev.snap.monsters ?? []).length === 0, '開發環境 quiet:true 不該生怪')
} finally {
  for (const socket of sockets) socket.close()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
}

console.log('quiet-prod: ok')
process.exit(0)
