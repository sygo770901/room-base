/**
 * 寶物房穿模點。PHASE=before|after
 *   npx tsx scripts/capture-sample-collision.ts
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'
import { resolvePlayerMove } from '../src/physics/collision.ts'
import { groundY } from '../shared/heightfield.ts'
import { heightFieldOf } from '../shared/heightmaps.ts'
import { SAMPLE_PLACES, sampleSolidHit } from '../shared/sampleRoom.ts'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.BATCH_URL || 'http://127.0.0.1:5173/'
const PHASE = process.env.PHASE === 'after' ? 'after' : 'before'
const OUT = resolve(import.meta.dirname, `../docs/batch1/sample-collision/${PHASE}`)

const field = heightFieldOf('sample')!

const R = 0.26
const space = { minX: 18, maxX: 54, minZ: 218, maxZ: 270, walkable: () => true }

function feetY(x: number, z: number) {
  return groundY(field, x, z) ?? 0
}

/** 修完之後人不站在模型裡面。往外找到第一個站得住的點。 */
function legal(x: number, z: number) {
  const here = groundY(field, x, z)
  if (here != null && !sampleSolidHit(x, z, here, R)) return { x, z, y: here }
  for (let dist = 0.15; dist <= 3; dist += 0.1) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2
      const px = x + Math.cos(ang) * dist
      const pz = z + Math.sin(ang) * dist
      const py = groundY(field, px, pz)
      if (py == null || sampleSolidHit(px, pz, py, R)) continue
      return { x: px, z: pz, y: py }
    }
  }
  return { x, z, y: here ?? 0 }
}

const spots: { id: string; x: number; z: number; y?: number }[] = [
  { id: 'stair-tread', x: 36.5, z: 232 },
  { id: 'stair-rail', x: 36, z: 230.05 },
  { id: 'platform-edge', x: 40.4, z: 224.6, y: 0 },
  { id: 'door-post', x: 28.5, z: 251.5 },
  { id: 'chest', x: 25.2, z: 261 },
  { id: 'crates', x: 23.2, z: 255.6 },
  { id: 'box-stacked', x: 30.2, z: 256.6 },
  { id: 'barrel', x: 37.8, z: 261.8 },
  { id: 'pillar', x: 23.2, z: 258.4 },
  { id: 'rubble', x: 30, z: 263.9 },
  { id: 'skeleton', x: 30.05, z: 245.6 },
  { id: 'keg', x: 26.4, z: 223.2 },
  { id: 'coins', x: 30.2, z: 260.6 },
]

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function clickText(page: Page, part: string) {
  const buttons = await page.$$('button')
  for (const button of buttons) {
    const text = await button.evaluate((el) => el.textContent || '')
    if (text.includes(part)) {
      await button.click()
      return true
    }
  }
  return false
}

function sim(
  x: number,
  z: number,
  dx: number,
  dz: number,
  n: number,
  pred: (x: number, z: number, y: number) => boolean,
  push: (x: number, z: number, y: number) => void,
) {
  let y = feetY(x, z)
  push(x, z, y)
  for (let i = 0; i < n; i++) {
    if (pred(x, z, y)) return
    const moved = resolvePlayerMove(x, z, dx, dz, [], R, [], y, [], field, space)
    if (Math.hypot(moved.x - x, moved.z - z) < 0.001) {
      console.log('walk stuck', x.toFixed(2), z.toFixed(2), 'y', y.toFixed(2))
      return
    }
    x = moved.x
    z = moved.z
    y = groundY(field, x, z) ?? y
    push(x, z, y)
  }
}

async function shot(
  page: Page,
  stood: { x: number; z: number; y: number },
  look: { x: number; y: number; z: number },
  path: string,
) {
  await page.evaluate(
    ({ x, y, z, lx, ly, lz }) => {
      const w = window as unknown as {
        __teleport?: (x: number, y: number, z: number) => void
        __freezeMonsters?: boolean
        __camLock?: { x: number; y: number; z: number; tx: number; ty: number; tz: number }
      }
      w.__freezeMonsters = true
      w.__teleport?.(x, y, z)
      w.__camLock = { x: x + 2.4, y: y + 1.7, z: z + 2.8, tx: lx, ty: ly, tz: lz }
    },
    { x: stood.x, y: stood.y, z: stood.z, lx: look.x, ly: look.y, lz: look.z },
  )
  await sleep(200)
  const pose = await page.evaluate(() => {
    const p = (window as unknown as { __pose?: { x: number; y: number; z: number } }).__pose
    return p ? { x: p.x, y: p.y, z: p.z } : null
  })
  if (!pose || Math.abs(pose.y - stood.y) > 0.15 || Math.hypot(pose.x - stood.x, pose.z - stood.z) > 0.2) {
    throw new Error(`畫面腳點不在模型上 ${path} pose=${JSON.stringify(pose)} want=${stood.y}`)
  }
  await page.screenshot({ path })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: `/tmp/sample-col-${PHASE}-${Date.now()}`,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('button', { timeout: 15000 })
  await clickText(page, '略過')
  await sleep(100)
  if (!(await clickText(page, '寶物房樣本'))) throw new Error('沒有寶物房')
  await page.$eval('input[placeholder="小明"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="小明"]', '拍')
  await page.$eval('input[placeholder="home"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="home"]', `col${PHASE}${Date.now() % 100000}`)
  if (!(await clickText(page, '我是房主'))) throw new Error('沒點到房主')
  await page.waitForFunction(() => Boolean((window as unknown as { __teleport?: unknown }).__teleport), { timeout: 25000 })
  await page.evaluate(() => {
    ;(window as unknown as { __shotLock?: boolean }).__shotLock = true
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  })
  await sleep(400)
  await page.evaluate(() => {
    for (const sel of ['.hud-top', '.hud-top-right', '.hud-bottom', '.minimap', '.toast', '.objective-banner', '.crosshair', '.tutorial', '.damage-readout']) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = 'none'
    }
  })

  for (const spot of spots) {
    const stood = PHASE === 'after' ? legal(spot.x, spot.z) : { x: spot.x, z: spot.z, y: spot.y ?? feetY(spot.x, spot.z) }
    const look = { x: spot.x, y: stood.y + 0.85, z: spot.z }
    await shot(page, stood, look, resolve(OUT, `${spot.id}.png`))
    console.log(PHASE, spot.id, 'stood', stood.x.toFixed(2), stood.z.toFixed(2), 'y', stood.y.toFixed(2))
  }

  if (PHASE === 'after') {
    const frames: { x: number; z: number; y: number }[] = []
    const push = (x: number, z: number, y: number) => frames.push({ x, z, y })
    sim(33, 232, 0.25, 0, 40, (x, _z, y) => x >= 40 && y >= 3.95, push)
    sim(frames.at(-1)!.x, frames.at(-1)!.z, -0.25, 0, 40, (x, _z, y) => x <= 33 && y <= 1.05, push)
    sim(48.8, 232, 0, -0.25, 40, (_x, z, y) => z <= 225.2 && y >= 3.9, push)
    for (const spot of spots) {
      if (spot.id === 'stair-tread' || spot.id === 'platform-edge') continue
      const stood = legal(spot.x, spot.z)
      push(stood.x, stood.z, stood.y)
    }
    let i = 0
    for (const frame of frames) {
      if (i % 4 !== 0 && i !== frames.length - 1) {
        i++
        continue
      }
      await shot(page, frame, { x: frame.x, y: frame.y + 0.85, z: frame.z }, resolve(OUT, `walk-${String(i).padStart(2, '0')}.png`))
      i++
    }
    console.log('walk frames', frames.length)

    const props = SAMPLE_PLACES.filter((p) => p.hx && p.hz)
    let n = 0
    for (const p of props) {
      const stood = legal(p.x, p.z)
      await shot(
        page,
        stood,
        { x: p.x, y: stood.y + 0.9, z: p.z },
        resolve(OUT, `prop-${n}-${p.model.replace(/\..*$/, '')}.png`),
      )
      n++
    }
    console.log('props', n)
  }

  await browser.close()
  console.log('capture-sample-collision', PHASE, OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
