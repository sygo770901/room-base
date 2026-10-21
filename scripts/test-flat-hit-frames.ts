/**
 * 三張平面圖各打一下，每張 3 輪。
 * 新鮮設定、一般模式。每幀標準差不低於 20。
 * 受擊後 0.5 秒內要看到「-數字」傷害。
 *
 * 前置：npm run dev，以及系統有 Chrome。
 * 執行：npx tsx scripts/test-flat-hit-frames.ts
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.HIT_URL || 'http://127.0.0.1:5173/'
const OUT = resolve(import.meta.dirname, '../docs/flat-hit')
const MAPS = [
  { id: 'kaykit', label: 'KayKit 地城' },
  { id: 'kenney', label: 'Kenney 模組地城' },
  { id: 'jungle', label: '叢林遺跡' },
] as const
const RUNS = 3
const STD_FLOOR = 20
const DEADLINE = Date.now() + 5 * 60 * 1000

type Pose = { x: number; y: number; z: number }
type Mob = { id: string; x: number; z: number }
type Cam = { x: number; y: number; z: number }
type Hit = { text: string; amount: number; at: number; id: string; kind: string }
type Dmg = { text: string; at: number; seen: number }
type Watch = { samples: number; minStd: number; empty: { std: number; mean: number }[] }

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

async function installWatch(page: Page) {
  const install = new Function(
    'floor',
    `const canvas = document.querySelector('canvas');
     const c = document.createElement('canvas');
     c.width = 80; c.height = 45;
     const ctx = c.getContext('2d', { willReadFrequently: true });
     const watch = { samples: 0, minStd: 999, empty: [] };
     window.__watch = watch;
     const tick = () => {
       if (canvas && ctx) {
         ctx.drawImage(canvas, 0, 0, c.width, c.height);
         const data = ctx.getImageData(0, 0, c.width, c.height).data;
         let n = 0, sum = 0, sum2 = 0;
         for (let i = 0; i < data.length; i += 4) {
           const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
           n += 1; sum += lum; sum2 += lum * lum;
         }
         const mean = n ? sum / n : 0;
         const std = Math.sqrt(Math.max(0, n ? sum2 / n - mean * mean : 0));
         watch.samples += 1;
         watch.minStd = Math.min(watch.minStd, std);
         if (std < floor) watch.empty.push({ std: std, mean: mean });
       }
       requestAnimationFrame(tick);
     };
     requestAnimationFrame(tick);`,
  ) as (floor: number) => void
  await page.evaluate(install, STD_FLOOR)
}

async function world(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __pose?: Pose
      __cam?: Cam
      __mobs?: Mob[]
      __self?: string | null
      __lastHit?: Hit
      __dmg?: Dmg
      __fontReady?: boolean
      __watch?: Watch
    }
    return {
      pose: w.__pose ?? null,
      cam: w.__cam ?? null,
      mobs: w.__mobs ?? [],
      self: w.__self ?? null,
      hit: w.__lastHit ?? null,
      dmg: w.__dmg ?? null,
      fontReady: Boolean(w.__fontReady),
      watch: w.__watch ?? null,
    }
  })
}

async function setKeys(page: Page, held: Set<string>, next: Set<string>) {
  for (const key of held) {
    if (!next.has(key)) await page.keyboard.up(key)
  }
  for (const key of next) {
    if (!held.has(key)) await page.keyboard.down(key)
  }
  held.clear()
  for (const key of next) held.add(key)
}

async function release(page: Page, held: Set<string>) {
  for (const key of held) await page.keyboard.up(key)
  held.clear()
}

async function oneRun(mapId: string, label: string, run: number) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: `/tmp/flat-hit-${mapId}-${run}-${Date.now()}`,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--window-size=960,540',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 })
  page.on('pageerror', (err) => console.log('PAGEERROR', mapId, run, err.message))
  const held = new Set<string>()
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('button', { timeout: 15000 })
    if (!(await clickText(page, '略過'))) console.log('沒有教學可略過')
    await new Promise((r) => setTimeout(r, 150))
    assert(await clickText(page, label), `找不到 ${label}`)
    await page.$eval('input[placeholder="小明"]', (el) => {
      ;(el as HTMLInputElement).value = ''
    })
    await page.type('input[placeholder="小明"]', '挨打')
    await page.$eval('input[placeholder="home"]', (el) => {
      ;(el as HTMLInputElement).value = ''
    })
    await page.type('input[placeholder="home"]', `hit${mapId}${run}${Date.now() % 100000}`)
    assert(await clickText(page, '我是房主'), '找不到房主按鈕')
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.waitForFunction(() => {
      const w = window as unknown as { __pose?: { x: number }; __cam?: { x: number } }
      return Boolean(w.__pose && w.__cam)
    }, { timeout: 20000 })
    await page.waitForFunction(() => !document.querySelector('.map-load'), { timeout: 25000 })
    await new Promise((r) => setTimeout(r, 300))
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.click('canvas')
    await installWatch(page)

    const chaseUntil = Date.now() + 40000
    let hit: Hit | null = null
    let stuckAt = Date.now()
    let stuckPose = { x: 0, z: 0 }
    let sidestep: 'KeyA' | 'KeyD' | null = null
    while (Date.now() < chaseUntil) {
      const snap = await world(page)
      if (snap.hit && snap.self && snap.hit.id === snap.self && snap.hit.kind === 'player') {
        hit = snap.hit
        break
      }
      if (snap.pose && snap.mobs.length) {
        const knight = snap.mobs.find((m) => m.id === 'knight') ?? snap.mobs[0]
        const dx = knight.x - snap.pose.x
        const dz = knight.z - snap.pose.z
        const dist = Math.hypot(dx, dz)
        const moved = Math.hypot(snap.pose.x - stuckPose.x, snap.pose.z - stuckPose.z)
        if (moved > 0.35) {
          stuckPose = { x: snap.pose.x, z: snap.pose.z }
          stuckAt = Date.now()
          sidestep = null
        } else if (Date.now() - stuckAt > 1200) {
          sidestep = sidestep === 'KeyA' ? 'KeyD' : 'KeyA'
          stuckAt = Date.now()
        }
        const down = new Set<string>()
        // 走廊在 z≈58。先走出去，再沿走廊靠近騎士。10m 以內站住，騎士會追上來。
        if (snap.pose.z < 56) {
          down.add('KeyW')
          if (sidestep) down.add(sidestep)
        } else if (dist > 10) {
          if (snap.pose.z < 57) down.add('KeyW')
          else if (snap.pose.z > 59) down.add('KeyS')
          if (dx > 0.8) down.add('KeyA')
          else if (dx < -0.8) down.add('KeyD')
        }
        await setKeys(page, held, down)
      }
      await new Promise((r) => setTimeout(r, 80))
    }
    await release(page, held)
    if (!hit) {
      const snap = await world(page)
      console.log('miss', mapId, snap.pose, snap.mobs.map((m) => `${m.id}@${m.x.toFixed(0)},${m.z.toFixed(0)}`).join(' '))
    }
    assert(hit != null, `${mapId} 第 ${run} 輪沒被打到`)
    let shown = ''
    const waitUntil = Date.now() + 500
    while (Date.now() < waitUntil) {
      shown = await page.evaluate(() => document.querySelector('.damage-readout')?.textContent || '')
      if (shown === hit.text) {
        await page.screenshot({ path: resolve(OUT, `${mapId}-${run}.png`) })
        break
      }
      await new Promise((r) => setTimeout(r, 30))
    }
    const watch = (await world(page)).watch
    assert(shown === hit.text && /^-\d+$/.test(shown), `${mapId} 第 ${run} 輪 0.5 秒內沒看到傷害數字，看到「${shown}」`)
    assert(
      watch != null && watch.empty.length === 0,
      `${mapId} 第 ${run} 輪有標準差低於 20 的幀 ${JSON.stringify(watch?.empty ?? [])} min=${watch?.minStd?.toFixed?.(1)}`,
    )
    console.log(mapId, run, shown, `minStd=${watch.minStd.toFixed(1)}`, `frames=${watch.samples}`)
  } finally {
    await release(page, held).catch(() => {})
    await browser.close()
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const skipped: string[] = []
  const only = process.env.HIT_MAP
  const runs = only ? 1 : RUNS
  for (const map of MAPS) {
    if (only && map.id !== only) continue
    for (let run = 1; run <= runs; run++) {
      if (Date.now() > DEADLINE) {
        skipped.push(`${map.id}#${run}`)
        continue
      }
      await oneRun(map.id, map.label, run)
    }
  }
  if (skipped.length) {
    console.log('skipped', skipped.join(','))
    process.exit(2)
  }
  console.log('flat-hit: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
