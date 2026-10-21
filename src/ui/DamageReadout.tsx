import { useEffect, useState } from 'react'
import { useAppStore } from '../store'

/** 傷害數字立刻畫在畫面上。3D 字要等字型，第一下會超過半秒。 */
export function DamageReadout() {
  const hit = useAppStore((s) => s.hits[s.hits.length - 1])
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!hit) return
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const slot = window as Window & { __dmg?: { text: string; at: number; seen: number } }
      slot.__dmg = { text: `-${hit.amount}`, at: hit.at, seen: performance.now() }
    }
    const tick = window.setInterval(() => setNow(performance.now()), 40)
    const stop = window.setTimeout(() => window.clearInterval(tick), 640)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(stop)
    }
  }, [hit])
  if (!hit || now - hit.at > 520) return null
  return <div className="damage-readout">{`-${hit.amount}`}</div>
}
