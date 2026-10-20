export type SfxName = 'attack' | 'hit' | 'hurt' | 'slam' | 'poop'

const FILES: Record<SfxName, string> = {
  attack: '/sfx/attack.wav',
  hit: '/sfx/hit.wav',
  hurt: '/sfx/hurt.wav',
  slam: '/sfx/slam.wav',
  poop: '/sfx/attack.wav',
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers = new Map<SfxName, AudioBuffer>()
let loading: Promise<void> | null = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.22
    master.connect(ctx.destination)
  }
  return ctx
}

async function loadAll() {
  const ac = getCtx()
  if (!ac) return
  await Promise.all(
    (Object.keys(FILES) as SfxName[]).map(async (name) => {
      const res = await fetch(FILES[name])
      const raw = await res.arrayBuffer()
      const buf = await ac.decodeAudioData(raw.slice(0))
      buffers.set(name, buf)
    }),
  )
}

export function unlockSfx() {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume()
  if (!loading) loading = loadAll().catch(() => undefined)
}

function playPoopPop() {
  const ac = getCtx()
  if (!ac || !master) return
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(140, ac.currentTime)
  o.frequency.exponentialRampToValueAtTime(48, ac.currentTime + 0.12)
  g.gain.setValueAtTime(0.001, ac.currentTime)
  g.gain.exponentialRampToValueAtTime(0.28, ac.currentTime + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.16)
  o.connect(g)
  g.connect(master)
  o.start()
  o.stop(ac.currentTime + 0.18)
}

export function playSfx(name: SfxName, rate = 1) {
  if (typeof window === 'undefined') return
  if (localStorage.getItem('rb-sfx') === '0') return
  unlockSfx()
  if (name === 'poop') {
    playPoopPop()
    return
  }
  const run = () => {
    const ac = getCtx()
    const buf = buffers.get(name)
    if (!ac || !master || !buf) return
    const src = ac.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ac.createGain()
    g.gain.value = name === 'slam' ? 0.9 : 1
    src.connect(g)
    g.connect(master)
    src.start()
  }
  if (buffers.has(name)) run()
  else void (loading ?? Promise.resolve()).then(run)
}
