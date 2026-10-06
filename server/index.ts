import express from 'express'
import { createServer } from 'http'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { attachSocketServer } from './socket.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)

attachSocketServer(httpServer)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/socket.io') || req.path.startsWith('/health')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

const PORT = Number(process.env.PORT) || 3001
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] ready on http://0.0.0.0:${PORT}`)
})
