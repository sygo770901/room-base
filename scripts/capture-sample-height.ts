/**
 * 寶物房一般模式：人從走廊走到樓梯中、再上到高度 4 的平台。
 * 不用 ?shot=1。人在左下，準心在正中。
 *
 * 前置：npm run dev，以及系統有 Chrome。
 * 執行：npx tsx scripts/capture-sample-height.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.SAMPLE_URL || 'http://127.0.0.1:5173/'
const OUT = resolve(import.meta.dirname, '../docs/sample-room')

type Pose = { x: number; y: number; z: number; yaw: number }
type View = { orange: number; ox: number; oy: number; crosshairDx: number; crosshairDy: number }

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
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

async function readPose(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __pose?: Pose }
    return w.__pose ?? null
  })
}

async function readView(page: Page): Promise<View> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    const blank = { orange: 0, ox: 0, oy: 0, crosshairDx: 999, crosshairDy: 999 }
    if (!canvas) return blank
    const w = 160
    const h = 90
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return blank
    ctx.drawImage(canvas, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    let orange = 0
    let ox = 0
    let oy = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (y > h * 0.4 && x < w * 0.52 && r > 115 && r > g + 15 && b < 175) {
          orange += 1
          ox += x
          oy += y
        }
      }
    }
    const hair = document.querySelector('.crosshair')?.getBoundingClientRect()
    return {
      orange,
      ox: orange ? ox / orange / w : 0,
      oy: orange ? oy / orange / h : 0,
      crosshairDx: hair ? hair.left + hair.width / 2 - window.innerWidth / 2 : 999,
      crosshairDy: hair ? hair.top + hair.height / 2 - window.innerHeight / 2 : 999,
    }
  })
}

async function holdUntil(page: Page, key: string, done: (pose: Pose) => boolean, limitMs: number) {
  const pose0 = await readPose(page)
  assert(pose0 != null, '還沒有座標')
  await page.keyboard.down(key)
  const start = Date.now()
  let pose = pose0
  try {
    while (Date.now() - start < limitMs) {
      await new Promise((r) => setTimeout(r, 100))
      const next = await readPose(page)
      if (!next) continue
      pose = next
      if (done(pose)) return pose
    }
  } finally {
    await page.keyboard.up(key)
  }
  return pose
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: `/tmp/sample-height-capture-${Date.now()}`,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--window-size=1280,720',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
    assert(!new URL(page.url()).searchParams.has('shot'), '一般模式不能帶 ?shot=1')
    await page.waitForSelector('button', { timeout: 15000 })
    if (!(await clickText(page, '略過'))) console.log('沒有教學可略過')
    await new Promise((r) => setTimeout(r, 200))
    assert(await clickText(page, '寶物房樣本'), '找不到寶物房樣本')
    await page.$eval('input[placeholder="小明"]', (el) => {
      ;(el as HTMLInputElement).value = ''
    })
    await page.type('input[placeholder="小明"]', '寶物')
    await page.$eval('input[placeholder="home"]', (el) => {
      ;(el as HTMLInputElement).value = ''
    })
    await page.type('input[placeholder="home"]', `smp${Date.now()}`)
    assert(await clickText(page, '我是房主'), '找不到房主按鈕')
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.waitForFunction(() => {
      const w = window as unknown as { __pose?: { z: number }; __cam?: { z: number } }
      return Boolean(w.__pose && w.__cam)
    }, { timeout: 20000 })
    await page.waitForFunction(() => !document.querySelector('.map-load'), { timeout: 25000 })
    await new Promise((r) => setTimeout(r, 600))
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.hud-top, .hud-top-right, .hud-bottom, .minimap, .toast')) {
        ;(el as HTMLElement).style.display = 'none'
      }
    })

    const stair = await holdUntil(page, 'KeyS', (p) => p.z <= 232.2, 20000)
    console.log('stair mouth', stair)
    assert(stair.z <= 232.4, `沒走到樓梯口 z=${stair.z.toFixed(2)}`)

    await page.keyboard.down('KeyA')
    let mid: Pose | null = null
    let top: Pose | null = null
    const climbStart = Date.now()
    try {
      while (Date.now() - climbStart < 20000) {
        await new Promise((r) => setTimeout(r, 80))
        const pose = await readPose(page)
        if (!pose) continue
        if (pose.z < 230.2) await page.keyboard.down('KeyW')
        else await page.keyboard.up('KeyW')
        if (pose.z > 234.2) await page.keyboard.down('KeyS')
        else if (pose.z >= 230.2) await page.keyboard.up('KeyS')
        if (!mid && pose.y >= 1.3 && pose.y <= 3.3) {
          mid = pose
          await new Promise((r) => setTimeout(r, 120))
          const view = await readView(page)
          await page.screenshot({ path: resolve(OUT, 'play-stairs.png') })
          console.log('mid', pose, view)
          assert(view.orange > 80, `樓梯中左下沒有角色，橙色像素 ${view.orange}`)
          assert(view.ox < 0.48 && view.oy > 0.48, `樓梯中角色不在左下 (${view.ox.toFixed(2)}, ${view.oy.toFixed(2)})`)
          assert(Math.abs(view.crosshairDx) < 12 && Math.abs(view.crosshairDy) < 12, `樓梯中準心不在正中`)
        }
        if (pose.y >= 3.9 && pose.x >= 40.2) {
          top = pose
          await new Promise((r) => setTimeout(r, 120))
          const view = await readView(page)
          await page.screenshot({ path: resolve(OUT, 'play-platform.png') })
          console.log('platform', pose, view)
          assert(view.orange > 80, `平台上左下沒有角色，橙色像素 ${view.orange}`)
          assert(view.ox < 0.48 && view.oy > 0.48, `平台上角色不在左下 (${view.ox.toFixed(2)}, ${view.oy.toFixed(2)})`)
          assert(Math.abs(view.crosshairDx) < 12 && Math.abs(view.crosshairDy) < 12, `平台上準心不在正中`)
          break
        }
      }
    } finally {
      await page.keyboard.up('KeyA')
      await page.keyboard.up('KeyW')
      await page.keyboard.up('KeyS')
    }
    assert(mid != null, '沒有停在樓梯中間')
    assert(top != null && top.y >= 3.9, `沒走上高度 4 的平台，最後 y=${top?.y ?? '無'}`)
    writeFileSync(
      resolve(OUT, 'play-log.json'),
      JSON.stringify({ shot: false, mid, top }, null, 2),
    )
    console.log('capture-sample-height: ok')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
