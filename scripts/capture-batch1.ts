/**
 * 大廳每張圖的遊戲畫面與俯視，以及飲水機間距。
 * 前置：vite 在 5173、伺服器在 3001、系統有 Chrome。
 * 執行：npx tsx scripts/capture-batch1.ts
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'
import { relaxDispenserSpacing } from '../shared/dispensers.ts'
import { lobbySceneIds, SCENE_LABELS, type SceneId } from '../shared/scenes.ts'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.BATCH_URL || 'http://127.0.0.1:5173/'
const OUT = resolve(import.meta.dirname, '../docs/batch1')
const MAPS = lobbySceneIds(false)

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

async function launch(tag: string) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: `/tmp/batch1-${tag}-${Date.now()}`,
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
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('pageerror', (err) => console.log('PAGEERROR', tag, err.message))
  return { browser, page }
}

async function join(page: Page, id: SceneId, room: string, shot = false) {
  const url = shot ? `${BASE}?shot=overview` : BASE
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('button', { timeout: 15000 })
  if (!(await clickText(page, '略過'))) console.log('沒有教學')
  await sleep(120)
  if (!(await clickText(page, SCENE_LABELS[id]))) throw new Error(`大廳沒有 ${SCENE_LABELS[id]}`)
  await page.$eval('input[placeholder="小明"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="小明"]', '拍')
  await page.$eval('input[placeholder="home"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="home"]', room)
  if (!(await clickText(page, '我是房主'))) throw new Error('沒點到房主')
  await page.waitForSelector('canvas', { timeout: 25000 })
  await page.waitForFunction(() => Boolean((window as unknown as { __pose?: unknown }).__pose), { timeout: 25000 })
  await page.waitForFunction(() => !document.querySelector('.map-load'), { timeout: 30000 }).catch(() => null)
  await sleep(shot ? 1200 : 700)
  await page.evaluate(() => {
    for (const sel of ['.hud-top', '.hud-top-right', '.hud-bottom', '.minimap', '.toast', '.objective-banner', '.crosshair', '.tutorial', '.damage-readout']) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = 'none'
    }
  })
}

async function readCam(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __pose?: { x: number; y: number; z: number }
      __cam?: { radius: number }
    }
    const pill = document.querySelector('.pill')?.textContent || ''
    return { pose: w.__pose ?? null, radius: w.__cam?.radius ?? null, pill }
  })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const only = process.env.BATCH_ONLY
  if (only === 'dispensers') {
    await captureDispensers()
    console.log('capture-batch1: ok', OUT)
    return
  }
  for (const id of MAPS) {
    const play = await launch(`${id}-play`)
    try {
      await join(play.page, id, `b1${id}p${Date.now() % 100000}`, false)
      const info = await readCam(play.page)
      console.log('play', id, info.pill, info.pose, 'r', info.radius)
      if (!info.pill.includes(SCENE_LABELS[id])) throw new Error(`${id} 進房後標籤是 ${info.pill}`)
      if (info.radius != null && info.radius < 2) throw new Error(`${id} 鏡頭縮到 ${info.radius}，地圖只剩一小塊`)
      await play.page.screenshot({ path: resolve(OUT, `${id}-play.png`) })
    } finally {
      await play.browser.close()
    }

    const over = await launch(`${id}-over`)
    try {
      await join(over.page, id, `b1${id}o${Date.now() % 100000}`, true)
      const info = await readCam(over.page)
      console.log('overview', id, info.pill)
      if (!info.pill.includes(SCENE_LABELS[id])) throw new Error(`${id} 俯視標籤是 ${info.pill}`)
      await sleep(400)
      await over.page.screenshot({ path: resolve(OUT, `${id}-overview.png`) })
    } finally {
      await over.browser.close()
    }
  }

  await captureDispensers()
  console.log('capture-batch1: ok', OUT)
}

async function captureDispensers() {
  const pets = await launch('pets')
  try {
    await join(pets.page, 'kenney', `b1pets${Date.now() % 100000}`, false)
    const piled = [
      { id: 'dispenser', x: 74, z: 28 },
      { id: 'dispenser-2', x: 74, z: 28 },
      { id: 'dispenser-3', x: 74, z: 28 },
      { id: 'dispenser-4', x: 74, z: 28 },
    ]
    const spaced = relaxDispenserSpacing(piled)
    const cx = spaced.reduce((s, p) => s + p.x, 0) / spaced.length
    const cz = spaced.reduce((s, p) => s + p.z, 0) / spaced.length
    await pets.page.evaluate(
      ({ piled, cx, cz }) => {
        const w = window as unknown as {
          __freezeMonsters?: boolean
          __store?: { getState: () => { setMonsters: (m: unknown[]) => void } }
          __camLock?: { x: number; y: number; z: number; tx: number; ty: number; tz: number }
        }
        w.__freezeMonsters = true
        w.__store?.getState().setMonsters(
          piled.map((p) => ({
            id: p.id,
            name: '飲水機',
            model: 'mage',
            kind: 'dispenser',
            x: p.x,
            z: p.z,
            y: 0,
            rotationY: 0,
            hp: 80,
            maxHp: 80,
            alive: true,
          })),
        )
        w.__camLock = { x: cx + 3.2, y: 5.4, z: cz + 4.6, tx: cx, ty: 1.1, tz: cz }
      },
      { piled, cx, cz },
    )
    await sleep(900)
    await pets.page.screenshot({ path: resolve(OUT, 'dispensers.png') })
    console.log('dispensers', spaced.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(' '))
  } finally {
    await pets.browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
