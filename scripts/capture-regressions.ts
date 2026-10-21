/**
 * 三個回歸的實機截圖：人形鴨大王、便便往前飛、自己和另一個分頁會跑。
 * 前置：npm run dev，以及系統有 Chrome。
 * 執行：npx tsx scripts/capture-regressions.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { cellCenter, isFloorCell } from '../shared/dungeon.ts'

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'
const BASE = process.env.REGRESSION_URL || 'http://localhost:5173/'
const OUT = resolve(import.meta.dirname, '../docs/regressions')
const DEADLINE = Date.now() + 4.5 * 60 * 1000

type Pose = { x: number; y: number; z: number; yaw: number }
type Cam = { x: number; y: number; z: number; theta: number; phi: number; radius: number }
type Mob = { id: string; x: number; z: number; phase?: number; hp?: number }
type Poop = {
  id: string
  x: number
  y: number
  z: number
  t: number
  gy: number
  until?: number
  thrownAt?: number
  landAt?: number
  now?: number
  nx?: number
  ny?: number
  nz?: number
  lx?: number
  lz?: number
  ox?: number
  oz?: number
}
type World = {
  pose: Pose | null
  server: { x: number; y: number; z: number } | null
  cam: Cam | null
  mobs: Mob[]
  self: string | null
  poop: Poop[]
  gaits: Record<string, { gait: string; speed: number; self: boolean }>
  clips: Record<string, string>
}

const skipped: string[] = []

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function timeLeft() {
  return DEADLINE - Date.now()
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
    userDataDir: `/tmp/regress-${tag}-${Date.now()}`,
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
  await page.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, attrs?: WebGLContextAttributes) {
      if (type === 'webgl' || type === 'webgl2') attrs = { ...attrs, preserveDrawingBuffer: true }
      return orig.call(this, type, attrs)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('pageerror', (err) => console.log('PAGEERROR', tag, err.message))
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('smoke') || text.includes('Smoke') || text.includes('setSmokes')) console.log('BROWSER', text)
  })
  return { browser, page }
}

async function join(page: Page, sceneLabel: string, modeLabel: string | null, name: string, room: string, host: boolean) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('button', { timeout: 15000 })
  if (!(await clickText(page, '略過'))) console.log('沒有教學可略過')
  await sleep(150)
  assert(await clickText(page, sceneLabel), `找不到地圖 ${sceneLabel}`)
  if (modeLabel) assert(await clickText(page, modeLabel), `找不到模式 ${modeLabel}`)
  await page.$eval('input[placeholder="小明"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="小明"]', name)
  await page.$eval('input[placeholder="home"]', (el) => {
    ;(el as HTMLInputElement).value = ''
  })
  await page.type('input[placeholder="home"]', room)
  assert(await clickText(page, host ? '我是房主' : '進入房間'), '進房按鈕沒點到')
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => {
    const w = window as unknown as { __pose?: Pose; __cam?: Cam }
    return Boolean(w.__pose && w.__cam)
  }, { timeout: 20000 })
  await page.waitForFunction(() => !document.querySelector('.map-load'), { timeout: 30000 })
  await sleep(300)
  await page.evaluate(() => {
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    Element.prototype.requestPointerLock = function () {
      return Promise.resolve()
    }
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  await page.click('canvas')
  await sleep(150)
}

async function installClock(page: Page, skew: number) {
  await page.evaluate((delta) => {
    const slot = window as Window & { __clock?: number; __dateOrig?: () => number }
    const orig = slot.__dateOrig ?? Date.now
    slot.__dateOrig = orig
    slot.__clock = orig() + delta
    Date.now = () => slot.__clock ?? orig()
  }, skew)
}

async function readClock(page: Page) {
  return page.evaluate(() => (window as Window & { __clock?: number }).__clock ?? Date.now())
}

async function stepFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      }),
  )
}

async function world(page: Page): Promise<World> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __pose?: Pose
      __server?: Pose | null
      __cam?: Cam
      __mobs?: Mob[]
      __self?: string | null
      __poop?: Poop[]
      __gaits?: World['gaits']
      __clips?: Record<string, string>
    }
    return {
      pose: w.__pose ?? null,
      server: w.__server ?? null,
      cam: w.__cam ?? null,
      mobs: w.__mobs ?? [],
      self: w.__self ?? null,
      poop: w.__poop ?? [],
      gaits: w.__gaits ?? {},
      clips: w.__clips ?? {},
    }
  })
}

function forwardOf(theta: number) {
  return { x: -Math.sin(theta), z: -Math.cos(theta) }
}

async function dragLook(page: Page, pixels: number) {
  const x0 = 420
  const y = 280
  await page.mouse.move(x0, y)
  await page.mouse.down()
  const steps = 5
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (pixels * i) / steps, y, { steps: 1 })
  }
  await page.mouse.up()
  await sleep(40)
}

async function face(page: Page, tx: number, tz: number) {
  const k = (2 * Math.PI * 0.3) / 720
  for (let i = 0; i < 3; i++) {
    const snap = await world(page)
    if (!snap.pose || !snap.cam) return
    const dx = tx - snap.pose.x
    const dz = tz - snap.pose.z
    const len = Math.hypot(dx, dz) || 1
    const f = forwardOf(snap.cam.theta)
    const dot = f.x * (dx / len) + f.z * (dz / len)
    const cross = f.x * (dz / len) - f.z * (dx / len)
    if (dot > 0.96) return
    const pixels = Math.max(-640, Math.min(640, Math.atan2(cross, dot) / k))
    await dragLook(page, pixels)
  }
}

async function release(page: Page) {
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE']) {
    await page.keyboard.up(key).catch(() => {})
  }
}

async function walkTo(page: Page, tx: number, tz: number, timeoutMs: number) {
  const start = Date.now()
  let last = await world(page)
  let stillAt = Date.now()
  let sidestep: 'KeyA' | 'KeyD' = 'KeyA'
  while (Date.now() - start < timeoutMs && timeLeft() > 8000) {
    const snap = await world(page)
    if (!snap.pose) break
    const dist = Math.hypot(tx - snap.pose.x, tz - snap.pose.z)
    if (dist < 1.35) {
      await release(page)
      return snap.pose
    }
    if (last.pose && Math.hypot(snap.pose.x - last.pose.x, snap.pose.z - last.pose.z) > 0.45) {
      last = snap
      stillAt = Date.now()
    } else if (Date.now() - stillAt > 1400) {
      await page.keyboard.up('KeyW')
      await page.keyboard.down('KeyE')
      await sleep(80)
      await page.keyboard.up('KeyE')
      await page.keyboard.down(sidestep)
      await sleep(280)
      await page.keyboard.up(sidestep)
      sidestep = sidestep === 'KeyA' ? 'KeyD' : 'KeyA'
      stillAt = Date.now()
    }
    await face(page, tx, tz)
    await page.keyboard.down('KeyW')
    await sleep(100)
  }
  await release(page)
  const end = await world(page)
  if (end.pose && Math.hypot(tx - end.pose.x, tz - end.pose.z) < 2.4) return end.pose
  console.log('walk fail', { tx, tz, pose: end.pose, theta: end.cam?.theta })
  return null
}

function pathToDuck() {
  const start = [18, 5]
  const goal = [34, 30]
  const q: [number, number][] = [[start[0], start[1]]]
  const prev = new Map<string, string>()
  prev.set(`${start[0]},${start[1]}`, '')
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  while (q.length) {
    const [x, z] = q.shift()!
    if (x === goal[0] && z === goal[1]) break
    for (const [dx, dz] of dirs) {
      const nx = x + dx
      const nz = z + dz
      const key = `${nx},${nz}`
      if (prev.has(key) || !isFloorCell(nx, nz)) continue
      prev.set(key, `${x},${z}`)
      q.push([nx, nz])
    }
  }
  const cells: [number, number][] = []
  let cur = `${goal[0]},${goal[1]}`
  if (!prev.has(cur)) return []
  while (cur) {
    const [x, z] = cur.split(',').map(Number) as [number, number]
    cells.push([x, z])
    cur = prev.get(cur) || ''
  }
  cells.reverse()
  const points = []
  for (let i = 1; i < cells.length; i++) points.push(cellCenter(cells[i][0], cells[i][1]))
  return points
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => {
    for (const sel of ['.hud-top', '.hud-top-right', '.hud-bottom', '.minimap', '.toast', '.countdown-banner', '.boss-hint', '.boss-objective', '.wait-dock', '.damage-layer']) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = 'none'
    }
  })
  await sleep(80)
  const file = resolve(OUT, name)
  await page.screenshot({ path: file })
  console.log('shot', name)
  return file
}

async function capturePoop(
  page: Page,
  label: string,
  skewMs: number,
  opts?: { marks?: number[]; side?: boolean; nudge?: boolean },
) {
  await installClock(page, skewMs)
  if (opts?.nudge !== false) {
    await page.keyboard.down('KeyW')
    await sleep(160)
    await page.keyboard.up('KeyW')
    await sleep(80)
  }
  const before = new Set((await world(page)).poop.map((p) => p.id))
  const canvas = await page.$('canvas')
  assert(Boolean(canvas), '沒有畫布')
  await canvas!.click({ button: 'right' })
  let appeared: Poop | null = null
  let theta = 0
  for (let i = 0; i < 40 && !appeared; i++) {
    const snap = await world(page)
    appeared = snap.poop.find((p) => !before.has(p.id)) ?? null
    theta = snap.cam?.theta ?? theta
    if (!appeared) await sleep(50)
  }
  assert(appeared != null, `${label} 沒扔出便便`)
  await page.evaluate((id) => {
    const slot = window as Window & { __holdSmoke?: string[] }
    slot.__holdSmoke = [id]
  }, appeared.id)
  console.log('appeared', label, appeared)
  assert(appeared.t < 0.45, `${label} 一出現就已經落地 t=${appeared.t.toFixed(2)} skew=${skewMs}`)
  const thrownAt = appeared.thrownAt ?? (await readClock(page))
  await page.evaluate((at) => {
    const slot = window as Window & { __clock?: number }
    slot.__clock = at
  }, thrownAt)
  const pose = (await world(page)).pose
  if (pose) {
    const ox = appeared.ox ?? pose.x
    const oz = appeared.oz ?? pose.z
    const lx = appeared.lx ?? appeared.x
    const lz = appeared.lz ?? appeared.z
    const dx = lx - ox
    const dz = lz - oz
    const len = Math.hypot(dx, dz) || 1
    const fx = dx / len
    const fz = dz / len
    const gy = appeared.gy ?? pose.y ?? 0
    const mx = (ox + lx) / 2
    const mz = (oz + lz) / 2
    const sideX = opts?.side ? -fz : 0
    const sideZ = opts?.side ? fx : 0
    await page.evaluate((lock) => {
      ;(window as Window & { __camLock?: typeof lock }).__camLock = lock
    }, opts?.side
      ? {
          x: mx + sideX * 9,
          y: gy + 3.4,
          z: mz + sideZ * 9,
          tx: mx,
          ty: gy + 1.3,
          tz: mz,
        }
      : {
          x: ox - fx * 9,
          y: gy + 2.2,
          z: oz - fz * 9,
          tx: mx,
          ty: gy + 1.25,
          tz: mz,
        })
    await stepFrames(page)
    console.log('cam lock', await page.evaluate(() => (window as Window & { __camDir?: unknown }).__camDir ?? null))
  }
  await page.evaluate(() => {
    for (const sel of ['.hud-top', '.hud-top-right', '.hud-bottom', '.minimap', '.toast', '.countdown-banner', '.boss-hint', '.boss-objective', '.wait-dock', '.damage-layer']) {
      for (const el of document.querySelectorAll(sel)) (el as HTMLElement).style.display = 'none'
    }
  })
  const marks = opts?.marks ?? [0, 110, 220, 340, 460, 560]
  const samples: { ms: number; poop: Poop }[] = []
  for (let i = 0; i < marks.length; i++) {
    const ms = marks[i]
    await page.evaluate((at) => {
      const slot = window as Window & { __clock?: number }
      slot.__clock = at
    }, thrownAt + ms)
    await stepFrames(page)
    const poop = (await world(page)).poop.find((p) => p.id === appeared.id) ?? null
    assert(poop != null, `${label} 便便在 ${ms}ms 消失`)
    samples.push({ ms, poop })
    const file = resolve(OUT, `${label}-${i}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 })
    console.log('frame', `${label}-${i}.jpg`, poop.t.toFixed(2), poop.y.toFixed(2))
  }
  console.log(
    label,
    samples
      .map((s) => `${s.ms}ms t=${s.poop.t.toFixed(2)} (${s.poop.x.toFixed(1)},${s.poop.y.toFixed(1)},${s.poop.z.toFixed(1)}) ndc=${(s.poop.nx ?? 9).toFixed(2)},${(s.poop.ny ?? 9).toFixed(2)}`)
      .join(' | '),
  )
  const first = samples[0]
  const last = samples[samples.length - 1]
  assert(first.poop.t < 0.2, `${label} 起點 t=${first.poop.t}`)
  assert(last.poop.t > 0.9, `${label} 560ms 時還沒落地 t=${last.poop.t}`)
  let f = forwardOf(theta)
  if (opts?.side && last.poop.ox != null && last.poop.lx != null && last.poop.oz != null && last.poop.lz != null) {
    const dx = last.poop.lx - last.poop.ox
    const dz = last.poop.lz - last.poop.oz
    const len = Math.hypot(dx, dz) || 1
    f = { x: dx / len, z: dz / len }
  }
  const along = (last.poop.x - first.poop.x) * f.x + (last.poop.z - first.poop.z) * f.z
  assert(along > 3, `${label} 沒有往準心前方飛 along=${along.toFixed(2)}`)
  const apex = Math.max(...samples.map((s) => s.poop.y))
  assert(apex > first.poop.y + 0.8, `${label} 沒有拋物線 apex=${apex.toFixed(2)} y0=${first.poop.y.toFixed(2)}`)
  if (opts?.side) {
    const gy = first.poop.gy ?? 0
    for (let i = 0; i < samples.length; i++) {
      assert(samples[i].poop.y > gy + 0.25, `${label} 第 ${i} 張沒有高過台面 y=${samples[i].poop.y.toFixed(2)} gy=${gy.toFixed(2)}`)
      if (i === 0) continue
      const prev = samples[i - 1].poop
      const moved = Math.hypot(samples[i].poop.x - prev.x, samples[i].poop.y - prev.y, samples[i].poop.z - prev.z)
      assert(moved > 0.35, `${label} 第 ${i} 張和前一張位置太近 ${moved.toFixed(2)}`)
    }
    const { createHash } = await import('node:crypto')
    const { readFileSync } = await import('node:fs')
    const hashes = samples.map((_, i) => createHash('sha1').update(readFileSync(resolve(OUT, `${label}-${i}.jpg`))).digest('hex'))
    assert(new Set(hashes).size === hashes.length, `${label} 截圖有重複畫面`)
  }
  return { firstY: first.poop.y, along, apex }
}

async function sectionPoop() {
  const platformOnly = Boolean(process.env.POOP_PLATFORM)
  if (!platformOnly) {
  const cases = [
    ['poop-forward', 0],
    ['poop-skew-plus', 2000],
    ['poop-skew-minus', -2000],
  ] as const
  for (const [label, skew] of process.env.POOP_ONE ? cases.slice(0, 1) : cases) {
    const { browser, page } = await launch(label)
    try {
      await join(page, '寶物房樣本', null, '扔', `${label}${Date.now()}`, true)
      const arc = await capturePoop(page, label, skew)
      console.log(label, arc)
    } finally {
      await browser.close()
    }
  }
  }

  if (!platformOnly && process.env.POOP_ONE) return
  const raised = await launch('platform')
  try {
    await join(raised.page, '寶物房樣本', null, '高台', `plat${Date.now()}`, true)
    await raised.page.keyboard.down('KeyS')
    const stairStart = Date.now()
    let pose: Pose | null = null
    while (Date.now() - stairStart < 18000) {
      pose = (await world(raised.page)).pose
      if (pose && pose.z <= 232.2) break
      await sleep(80)
    }
    await raised.page.keyboard.up('KeyS')
    assert(pose != null && pose.z <= 232.6, `沒走到樓梯 z=${pose?.z}`)
    await raised.page.keyboard.down('KeyA')
    const climbStart = Date.now()
    let top: Pose | null = null
    while (Date.now() - climbStart < 18000) {
      const snap = await world(raised.page)
      pose = snap.pose
      if (!pose) continue
      if (pose.z < 230.2) await raised.page.keyboard.down('KeyW')
      else await raised.page.keyboard.up('KeyW')
      if (pose.z > 234.2) await raised.page.keyboard.down('KeyS')
      else if (pose.z >= 230.2) await raised.page.keyboard.up('KeyS')
      if (pose.y >= 3.9 && pose.x >= 40.2) {
        top = pose
        break
      }
      await sleep(80)
    }
    await release(raised.page)
    assert(top != null && top.y >= 3.9, `沒站上高台 y=${top?.y}`)
    await raised.page.keyboard.down('KeyW')
    const faceStart = Date.now()
    while (Date.now() - faceStart < 2500) {
      const snap = await world(raised.page)
      const here = snap.pose
      if (!here || here.y < 3.5) break
      await raised.page.evaluate((lock) => {
        ;(window as Window & { __camLock?: typeof lock }).__camLock = lock
      }, {
        x: here.x - 3.2,
        y: here.y + 1.7,
        z: here.z,
        tx: here.x + 8,
        ty: here.y + 1.1,
        tz: here.z,
      })
      const yaw = here.yaw
      let diff = yaw - Math.PI / 2
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) < 0.3 && here.x < 48) break
      await sleep(90)
    }
    await raised.page.keyboard.up('KeyW')
    const faced = (await world(raised.page)).pose
    assert(faced != null && faced.y >= 3.5, `轉身時掉下高台 y=${faced?.y}`)
    const raisedArc = await capturePoop(raised.page, 'poop-platform', 0, {
      marks: [0, 100, 200, 300, 400, 520],
      side: true,
      nudge: false,
    })
    assert(raisedArc.firstY > 3.5, `高台便便沒有加上地面高度 y=${raisedArc.firstY.toFixed(2)}`)
    console.log('poop platform', raisedArc, top)
  } finally {
    await raised.browser.close()
  }
}

async function sectionRun() {
  const room = `run${Date.now()}`
  const a = await launch('run-a')
  const b = await launch('run-b')
  try {
    await join(a.page, '寶物房樣本', null, '自己', room, true)
    await join(b.page, '寶物房樣本', null, '隊友', room, false)
    await sleep(400)
    const holdMoving = async (page: Page) => {
      for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
        await page.keyboard.down(key)
        let moved = false
        for (let n = 0; n < 8; n++) {
          await sleep(200)
          const snap = await world(page)
          const self = snap.self
          const speed = self ? snap.gaits[self]?.speed ?? 0 : 0
          const clip = self ? snap.clips[self] : ''
          if (speed > 3) moved = true
          if (moved && clip === 'Running_A') return key
        }
        if (!moved) await page.keyboard.up(key)
      }
      return null
    }
    const keyA = await holdMoving(a.page)
    const keyB = await holdMoving(b.page)
    console.log('move keys', keyA, keyB)
    assert(Boolean(keyA && keyB), `有人跑不起來 ${keyA} ${keyB}`)
    const movingA = await world(a.page)
    const movingB = await world(b.page)
    const extra = await a.page.evaluate(() => {
      const w = window as Window & { __gaitState?: unknown; __flushErr?: string; __loco?: unknown }
      return { state: w.__gaitState ?? null, err: w.__flushErr ?? '', loco: w.__loco ?? null }
    })
    const extraB = await b.page.evaluate(() => (window as Window & { __loco?: unknown }).__loco ?? null)
    console.log('run gaits', movingA.gaits, movingA.clips, extra, movingB.gaits, movingB.clips, extraB)
    const selfId = movingA.self
    const otherId = movingB.self
    assert(Boolean(selfId && otherId), '沒有玩家 id')
    assert(movingA.clips[selfId!] === 'Running_A', `自己移動時不是 Running_A：${movingA.clips[selfId!]}`)
    assert(movingB.clips[otherId!] === 'Running_A', `隊友自己不是 Running_A：${movingB.clips[otherId!]}`)
    assert(movingA.clips[otherId!] === 'Running_A', `這頁看到的隊友不是 Running_A：${JSON.stringify(movingA.clips)} ${JSON.stringify(movingA.gaits)}`)
    assert(movingB.clips[selfId!] === 'Running_A', `另一頁看到的自己不是 Running_A：${JSON.stringify(movingB.clips)} ${JSON.stringify(movingB.gaits)}`)
    await shot(a.page, 'run-self-and-other.png')
    await shot(b.page, 'run-other-tab.png')
    await release(a.page)
    await release(b.page)
    await sleep(700)
    const idleA = await world(a.page)
    const idleB = await world(b.page)
    console.log('idle clips', idleA.clips, idleB.clips)
    assert(idleA.clips[selfId!] === 'Idle_A', `自己停下不是 Idle_A：${idleA.clips[selfId!]}`)
    assert(idleB.clips[otherId!] === 'Idle_A', `隊友停下不是 Idle_A：${idleB.clips[otherId!]}`)
    await shot(a.page, 'idle-self-and-other.png')
    await shot(b.page, 'idle-other-tab.png')
  } finally {
    await a.browser.close()
    await b.browser.close()
  }
}

async function aimLock(page: Page, px: number, py: number, pz: number, fx: number, fz: number) {
  await page.evaluate((lock) => {
    ;(window as Window & { __camLock?: typeof lock }).__camLock = lock
  }, {
    x: px - fx * 3.2,
    y: py + 1.7,
    z: pz - fz * 3.2,
    tx: px + fx * 8,
    ty: py + 1.1,
    tz: pz + fz * 8,
  })
}

async function walkAim(page: Page, tx: number, tz: number, timeoutMs: number) {
  const start = Date.now()
  await page.keyboard.down('KeyW')
  try {
    while (Date.now() - start < timeoutMs && timeLeft() > 20000) {
      const step = await page.evaluate((goal) => {
        const w = window as unknown as {
          __pose?: Pose
          __server?: { x: number; z: number } | null
          __camLock?: { x: number; y: number; z: number; tx: number; ty: number; tz: number }
        }
        const pose = w.__pose
        if (!pose) return null
        const dx = goal.x - pose.x
        const dz = goal.z - pose.z
        const dist = Math.hypot(dx, dz)
        const len = dist || 1
        const fx = dx / len
        const fz = dz / len
        w.__camLock = {
          x: pose.x - fx * 3.2,
          y: pose.y + 1.7,
          z: pose.z - fz * 3.2,
          tx: pose.x + fx * 8,
          ty: pose.y + 1.1,
          tz: pose.z + fz * 8,
        }
        const server = w.__server
        const gap = server ? Math.hypot(server.x - pose.x, server.z - pose.z) : 0
        return { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, dist, gap }
      }, { x: tx, z: tz })
      if (!step) break
      if (step.dist < 3.1) return { x: step.x, y: step.y, z: step.z, yaw: step.yaw }
      await sleep(80)
    }
  } finally {
    await page.keyboard.up('KeyW')
  }
  const end = await world(page)
  console.log('aim miss', { tx, tz, pose: end.pose })
  return null
}

function duckCamera(duck: { x: number; z: number }) {
  const gx = Math.floor(duck.x / 4)
  const gz = Math.floor(duck.z / 4)
  const rings = [
    [0, 2],
    [2, 1],
    [-2, 1],
    [0, -2],
    [2, -1],
    [-2, -1],
    [3, 0],
    [-3, 0],
  ]
  for (const [dx, dz] of rings) {
    if (!isFloorCell(gx + dx, gz + dz)) continue
    const cell = cellCenter(gx + dx, gz + dz)
    if (Math.hypot(cell.x - duck.x, cell.z - duck.z) < 4) continue
    return cell
  }
  return { x: duck.x, z: duck.z + 6 }
}

async function frameDuck(page: Page, duck: { x: number; z: number }) {
  const cam = duckCamera(duck)
  await page.evaluate((lock) => {
    const w = window as unknown as { __camLock?: typeof lock; __camTheta?: number }
    delete w.__camTheta
    w.__camLock = lock
  }, {
    x: cam.x,
    y: 1.65,
    z: cam.z,
    tx: duck.x,
    ty: 1.15,
    tz: duck.z,
  })
  await sleep(350)
}

async function sectionDuck() {
  const room = `duck${Date.now()}`
  const { browser, page } = await launch('duck')
  try {
    await join(page, 'KayKit 地城', '打鴨王', '打王', room, true)
    await page.evaluate(() => {
      const el = document.querySelector('.wait-dock') as HTMLElement | null
      if (el) el.style.pointerEvents = 'none'
    })
    const points = pathToDuck()
    assert(points.length > 0, '沒有走到王房的路')
    let misses = 0
    for (const point of points) {
      if (timeLeft() < 55000) break
      const pose = await walkAim(page, point.x, point.z, 4500)
      if (!pose) {
        misses += 1
        console.log('waypoint miss', point, 'streak', misses)
        if (misses >= 4) break
      } else {
        misses = 0
      }
    }
    const duckNow = (await world(page)).mobs.find((m) => m.id === 'duck-king')
    assert(duckNow != null, '場上沒有鴨大王')
    const near = await walkAim(page, duckNow.x, duckNow.z - 2.2, 10000)
    assert(near != null, `沒靠近鴨大王，人在 ${near ? '' : (await world(page)).pose?.x},${(await world(page)).pose?.z} 鴨在 ${duckNow.x.toFixed(1)},${duckNow.z.toFixed(1)}`)
    await page.evaluate(() => {
      const el = document.querySelector('.wait-dock') as HTMLElement | null
      if (el) el.style.pointerEvents = ''
    })
    assert(await clickText(page, '開始'), '沒按到開始')
    await frameDuck(page, duckNow)
    await shot(page, 'duck-normal.png')
    const countStart = Date.now()
    while (Date.now() - countStart < 5600) await sleep(100)
    const attackUntil = Date.now() + 40000
    let dodgeAt = Date.now() + 3200
    let phase = 1
    let lastLog = 0
    while (Date.now() < attackUntil && timeLeft() > 8000) {
      const snap = await world(page)
      const duck = snap.mobs.find((m) => m.id === 'duck-king')
      if (!duck || !snap.pose) break
      phase = duck.phase ?? 1
      if (phase === 2) break
      if (
        snap.server &&
        Math.hypot(snap.server.x - snap.pose.x, snap.server.z - snap.pose.z) > 6
      ) {
        console.log('desync', snap.pose, snap.server, duck)
        await release(page)
        await sleep(400)
        continue
      }
      const dx = duck.x - snap.pose.x
      const dz = duck.z - snap.pose.z
      const dist = Math.hypot(dx, dz) || 1
      if (Date.now() > dodgeAt && dist < 3.3) {
        await page.keyboard.up('KeyW')
        await page.keyboard.down('KeyS')
        await sleep(380)
        await page.keyboard.up('KeyS')
        dodgeAt = Date.now() + 4600
      }
      await aimLock(page, snap.pose.x, snap.pose.y, snap.pose.z, dx / dist, dz / dist)
      await page.keyboard.down('KeyW')
      await page.keyboard.down('KeyF')
      await sleep(90)
      await page.keyboard.up('KeyF')
      await sleep(140)
      if (Date.now() - lastLog > 2000) {
        lastLog = Date.now()
        console.log('fight', { hp: duck.hp, phase, dist: dist.toFixed(1), x: snap.pose.x.toFixed(1), z: snap.pose.z.toFixed(1) })
      }
    }
    await release(page)
    const raging = (await world(page)).mobs.find((m) => m.id === 'duck-king')
    assert(raging?.phase === 2, `鴨大王沒有進入憤怒，phase=${raging?.phase} hp=${raging?.hp}`)
    await frameDuck(page, raging!)
    await shot(page, 'duck-raging.png')
    console.log('duck', { normal: duckNow, raging })
  } finally {
    await browser.close()
  }
}

async function sectionDuckCam() {
  const { browser, page } = await launch('duckcam')
  try {
    await join(page, 'KayKit 地城', '打鴨王', '打王', `duck${Date.now()}`, true)
    const duck = (await world(page)).mobs.find((m) => m.id === 'duck-king')
    assert(duck != null, '場上沒有鴨大王')
    await frameDuck(page, duck)
    await shot(page, 'duck-normal.png')
    await page.evaluate(() => {
      ;(window as Window & { __rageDuck?: boolean }).__rageDuck = true
    })
    await page.waitForFunction(() => (window as Window & { __duckRed?: boolean }).__duckRed === true, { timeout: 4000 }).catch(() => {})
    const red = await page.evaluate(() => (window as Window & { __duckRed?: boolean }).__duckRed ?? null)
    console.log('duck red flag', red)
    await sleep(250)
    await shot(page, 'duck-raging.png')
    console.log('duckcam', duck)
  } finally {
    await browser.close()
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const only = process.argv[2]
  const jobs: [string, () => Promise<void>][] = [
    ['poop', sectionPoop],
    ['run', sectionRun],
    ['duck', sectionDuck],
    ['duckcam', sectionDuckCam],
  ]
  for (const [name, job] of jobs) {
    if (only && name !== only) continue
    if (timeLeft() < 15000) {
      skipped.push(name)
      console.log('SKIP', name, 'deadline')
      continue
    }
    try {
      await job()
      console.log('OK', name)
    } catch (err) {
      skipped.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      console.log('FAIL', name, err)
    }
  }
  writeFileSync(resolve(OUT, 'skipped.txt'), skipped.join('\n'))
  console.log('skipped', skipped)
  if (skipped.length) process.exitCode = 1
}

await main()
