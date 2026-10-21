/**
 * 一般模式實機走 heightlab：清空的瀏覽器設定、正常速度、怪物開著。
 * 從出生點按住 W，每 0.5 秒記 x/z/yaw 並截圖。
 * 路線是直的（x 維持 14）。若 x 偏離出生線超過 0.45m，才用 A/D 拉回，並在紀錄裡標 steer。
 * 這個地圖 D 是往 -X。
 *
 * 前置：npm run dev（5173 + 3001），以及系統有 Chrome。
 * 執行：npx tsx scripts/capture-heightlab.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.HEIGHTLAB_URL || 'http://127.0.0.1:5173/'
const OUT = resolve(import.meta.dirname, '../docs/heightlab')
const FRAMES = 26
const GAP_MS = 500
/** 清空色 #2a2428 的亮度約 39。整張幾乎同色、標準差很低，就是空場景。 */
const EMPTY_MEAN = 52
const EMPTY_STD = 22

type Pose = { x: number; y: number; z: number; yaw: number; monsters: number }
type Cam = { x: number; y: number; z: number; theta: number; phi: number; radius: number; shoulder: number }
type SceneStats = {
  mean: number
  std: number
  orange: number
  ox: number
  oy: number
  empty: boolean
}
type Snap = { t: number; from: [number, number, number] | null; to: [number, number, number]; yaw: number }
type Sample = {
  i: number
  t: number
  pose: Pose
  cam: Cam
  steer: 'none' | 'a' | 'd'
  monsters: number
  scene: SceneStats
  crosshairDx: number
  crosshairDy: number
}

const WAYPOINTS = [
  { name: 'spawn', z: 6 },
  { name: 'stairs', z: 16 },
  { name: 'platform', z: 22 },
  { name: 'edge', z: 25.5 },
  { name: 'fall', z: 27 },
]

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
    const w = window as unknown as { __pose?: Pose; __cam?: Cam }
    return { pose: w.__pose ?? null, cam: w.__cam ?? null }
  })
}

async function readScene(page: Page) {
  return page.evaluate((limits) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    const empty: SceneStats = { mean: 0, std: 0, orange: 0, ox: 0, oy: 0, empty: true }
    if (!canvas) return { scene: empty, crosshairDx: 999, crosshairDy: 999 }
    const w = 160
    const h = 90
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { scene: empty, crosshairDx: 999, crosshairDy: 999 }
    ctx.drawImage(canvas, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    let n = 0
    let sum = 0
    let sum2 = 0
    let orange = 0
    let ox = 0
    let oy = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        n += 1
        sum += lum
        sum2 += lum * lum
        if (y > h * 0.4 && x < w * 0.52 && r > 115 && r > g + 15 && b < 175) {
          orange += 1
          ox += x
          oy += y
        }
      }
    }
    const mean = n ? sum / n : 0
    const variance = n ? sum2 / n - mean * mean : 0
    const std = Math.sqrt(Math.max(0, variance))
    const hair = document.querySelector('.crosshair')?.getBoundingClientRect()
    const crosshairDx = hair ? hair.left + hair.width / 2 - window.innerWidth / 2 : 999
    const crosshairDy = hair ? hair.top + hair.height / 2 - window.innerHeight / 2 : 999
    return {
      scene: {
        mean,
        std,
        orange,
        ox: orange ? ox / orange / w : 0,
        oy: orange ? oy / orange / h : 0,
        empty: mean < limits.mean || std < limits.std,
      },
      crosshairDx,
      crosshairDy,
    }
  }, { mean: EMPTY_MEAN, std: EMPTY_STD })
}

async function installFrameWatch(page: Page) {
  // 函式本體用字串，避免 tsx 塞進瀏覽器沒有的 __name。
  const install = new Function(
    'limits',
    `const canvas = document.querySelector('canvas');
     const c = document.createElement('canvas');
     c.width = 80; c.height = 45;
     const ctx = c.getContext('2d', { willReadFrequently: true });
     const watch = { samples: 0, minStd: 999, minMean: 999, empty: [] };
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
         watch.minMean = Math.min(watch.minMean, mean);
         if (mean < limits.mean || std < limits.std) {
           const pose = window.__pose;
           watch.empty.push({ t: performance.now(), mean: mean, std: std, z: pose ? pose.z : null });
         }
       }
       requestAnimationFrame(tick);
     };
     requestAnimationFrame(tick);`,
  ) as (limits: { mean: number; std: number }) => void
  await page.evaluate(install, { mean: EMPTY_MEAN, std: EMPTY_STD })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: `/tmp/heightlab-capture-${Date.now()}`,
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  assert(!new URL(page.url()).searchParams.has('shot'), '一般模式不能帶 ?shot=1')
  await page.waitForSelector('button', { timeout: 15000 })
  if (!(await clickText(page, '略過'))) console.log('沒有教學可略過')
  await new Promise((r) => setTimeout(r, 200))
  assert(await clickText(page, '高度試驗'), '找不到高度試驗')
  await page.$eval('input[placeholder="小明"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="小明"]', '鏡頭')
  await page.$eval('input[placeholder="home"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="home"]', `cap${Date.now()}`)
  assert(await clickText(page, '我是房主'), '找不到房主按鈕')
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => {
    const w = window as unknown as { __pose?: { z: number }; __cam?: { z: number } }
    return Boolean(w.__pose && w.__cam)
  }, { timeout: 20000 })
  await page.waitForFunction(() => !document.querySelector('.map-load'), { timeout: 25000 })
  const painted = Date.now() + 8000
  let fog = 1
  while (Date.now() < painted) {
    fog = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
      if (!canvas) return 1
      const c = document.createElement('canvas')
      c.width = 160
      c.height = 90
      const ctx = c.getContext('2d')
      if (!ctx) return 1
      ctx.drawImage(canvas, 0, 0, 160, 90)
      const data = ctx.getImageData(0, 0, 160, 90).data
      let n = 0
      let bg = 0
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        n += 1
        if (Math.abs(r - 42) < 18 && Math.abs(g - 36) < 18 && Math.abs(b - 40) < 18) bg += 1
      }
      return n ? bg / n : 1
    })
    if (fog < 0.55) break
    await new Promise((r) => setTimeout(r, 100))
  }
  console.log('spawn fog', fog.toFixed(3))
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.hud-top, .hud-top-right, .hud-bottom, .minimap, .toast')) {
      ;(el as HTMLElement).style.display = 'none'
    }
  })
  await installFrameWatch(page)

  const samples: Sample[] = []
  const started = Date.now()
  let watch: { samples: number; minStd: number; minMean: number; empty: { t: number; mean: number; std: number; z: number | null }[] } = {
    samples: 0,
    minStd: 999,
    minMean: 999,
    empty: [],
  }
  let snaps: Snap[] = []
  await page.keyboard.down('KeyW')
  let steering: 'none' | 'a' | 'd' = 'none'
  try {
    for (let i = 0; i < FRAMES; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS))
      const snap = await readPose(page)
      assert(snap.pose != null && snap.cam != null, `第 ${i} 幀讀不到座標`)
      const pose = snap.pose
      const cam = snap.cam
      let steer: Sample['steer'] = 'none'
      if (pose.x > 14.45) {
        steer = 'd'
        if (steering !== 'd') {
          if (steering === 'a') await page.keyboard.up('KeyA')
          await page.keyboard.down('KeyD')
          steering = 'd'
        }
      } else if (pose.x < 13.55) {
        steer = 'a'
        if (steering !== 'a') {
          if (steering === 'd') await page.keyboard.up('KeyD')
          await page.keyboard.down('KeyA')
          steering = 'a'
        }
      } else if (steering !== 'none') {
        await page.keyboard.up(steering === 'a' ? 'KeyA' : 'KeyD')
        steering = 'none'
      }
      const view = await readScene(page)
      const name = `frame-${String(i).padStart(2, '0')}.png`
      await page.screenshot({ path: resolve(OUT, name) })
      const row: Sample = {
        i,
        t: Date.now() - started,
        pose,
        cam,
        steer,
        monsters: pose.monsters,
        scene: view.scene,
        crosshairDx: view.crosshairDx,
        crosshairDy: view.crosshairDy,
      }
      samples.push(row)
      console.log(
        i,
        `t=${row.t}`,
        `x=${pose.x.toFixed(2)} z=${pose.z.toFixed(2)} y=${pose.y.toFixed(2)} yaw=${pose.yaw.toFixed(3)}`,
        `theta=${cam.theta.toFixed(3)} r=${cam.radius.toFixed(2)} camZ=${cam.z.toFixed(2)}`,
        `monsters=${pose.monsters}`,
        `steer=${steer}`,
        `mean=${view.scene.mean.toFixed(1)} std=${view.scene.std.toFixed(1)} orange=${view.scene.orange}`,
        view.scene.empty ? 'EMPTY' : 'scene',
      )
    }
    const trace = await page.evaluate(() => {
      const w = window as unknown as {
        __watch?: { samples: number; minStd: number; minMean: number; empty: { t: number; mean: number; std: number; z: number | null }[] }
        __snaps?: Snap[]
      }
      return { watch: w.__watch ?? null, snaps: w.__snaps ?? [] }
    })
    if (trace.watch) watch = trace.watch
    snaps = trace.snaps
  } finally {
    await page.keyboard.up('KeyW')
    if (steering !== 'none') await page.keyboard.up(steering === 'a' ? 'KeyA' : 'KeyD')
    await browser.close()
  }

  const xs = samples.map((s) => s.pose.x)
  const maxDrift = Math.max(...xs.map((x) => Math.abs(x - 14)))
  const yawAbs = Math.max(...samples.map((s) => Math.abs(s.pose.yaw)))
  const thetaAbs = Math.max(...samples.map((s) => Math.abs(Math.atan2(Math.sin(s.cam.theta - Math.PI), Math.cos(s.cam.theta - Math.PI)))))
  const steered = samples.some((s) => s.steer !== 'none')
  const monsterFrames = samples.filter((s) => s.monsters > 0).length
  const reached = WAYPOINTS.filter((wp) => samples.some((s) => s.pose.z >= wp.z - 0.4))
  writeFileSync(
    resolve(OUT, 'walk-log.json'),
    JSON.stringify(
      {
        mode: 'normal',
        shot: false,
        speed: 'normal',
        frames: samples,
        maxAbsXDrift: maxDrift,
        maxAbsYaw: yawAbs,
        maxAbsThetaFromPi: thetaAbs,
        steered,
        monsterFrames,
        reached: reached.map((wp) => wp.name),
        corrections: snaps,
        frameWatch: {
          samples: watch.samples,
          minStd: watch.minStd,
          minMean: watch.minMean,
          empty: watch.empty,
        },
      },
      null,
      2,
    ),
  )
  const emptyFrames = samples.filter((s) => s.scene.empty)
  const firstBlank = watch.empty[0]
  assert(emptyFrames.length === 0, `空場景幀 ${emptyFrames.map((s) => s.i).join(',')}`)
  assert(
    watch.empty.length === 0,
    `按住 W 的途中有 ${watch.empty.length} 張空畫面，第一張 z=${firstBlank?.z ?? '無'} mean=${firstBlank ? firstBlank.mean.toFixed(1) : ''}`,
  )
  for (const row of samples) {
    assert(row.scene.orange > 80, `第 ${row.i} 幀左下沒有角色，橙色像素 ${row.scene.orange}`)
    assert(row.scene.ox < 0.48 && row.scene.oy > 0.48, `第 ${row.i} 幀角色不在左下 (${row.scene.ox.toFixed(2)}, ${row.scene.oy.toFixed(2)})`)
    assert(Math.abs(row.crosshairDx) < 12 && Math.abs(row.crosshairDy) < 12, `第 ${row.i} 幀準心不在正中 dx=${row.crosshairDx.toFixed(1)} dy=${row.crosshairDy.toFixed(1)}`)
  }
  assert(monsterFrames > 0, '一般模式應該有怪物')
  assert(!steered, `按住 W 不該需要修正方向，最大橫漂 ${maxDrift.toFixed(2)}`)
  assert(maxDrift < 0.45, `x 漂離 14 達 ${maxDrift.toFixed(2)}`)
  assert(yawAbs < 0.2, `面向被帶著轉 yaw=${yawAbs.toFixed(3)}`)
  assert(thetaAbs < 0.05, `鏡頭 theta 轉了 ${thetaAbs.toFixed(3)}`)
  for (const wp of WAYPOINTS) {
    assert(
      samples.some((s) => s.pose.z >= wp.z - 0.4),
      `沒走到 ${wp.name}（z=${wp.z}），最後 z=${samples[samples.length - 1]?.pose.z.toFixed(2)}`,
    )
  }
  console.log('capture-heightlab: ok', {
    maxDrift,
    yawAbs,
    thetaAbs,
    monsterFrames,
    frames: samples.length,
    corrections: snaps.length,
    watched: watch.samples,
    minStd: Number(watch.minStd.toFixed(1)),
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
