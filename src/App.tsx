import { useEffect } from 'react'
import { Lobby } from './ui/Lobby'
import { Hud } from './ui/Hud'
import { ReconnectBanner } from './ui/ReconnectBanner'
import { Tutorial } from './ui/Tutorial'
import { RoomScene } from './scene/RoomScene'
import { bindLoadErrorWatch, startCriticalPreload } from './load/mapLoad'
import { resumeSessionIfNeeded } from './net/socket'
import { unlockSfx } from './audio/sfx'
import { useAppStore } from './store'

function sceneShell(scene: string) {
  if (scene === 'jungle') return '#1c2a1c'
  if (scene === 'kaykit') return '#2a2428'
  return '#3a3544'
}

function MapLoadWatch() {
  const scene = useAppStore((s) => s.scene)
  const retry = useAppStore((s) => s.mapLoadRetry)
  const phase = useAppStore((s) => s.phase)
  useEffect(() => {
    if (phase !== 'room') return
    const stopWatch = bindLoadErrorWatch()
    const stopPreload = startCriticalPreload(scene, retry)
    return () => {
      stopWatch()
      stopPreload()
    }
  }, [phase, scene, retry])
  return null
}

export default function App() {
  const phase = useAppStore((s) => s.phase)
  const scene = useAppStore((s) => s.scene)
  const retry = useAppStore((s) => s.mapLoadRetry)

  useEffect(() => {
    resumeSessionIfNeeded()
    const unlock = () => unlockSfx()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  if (phase === 'lobby') {
    return (
      <>
        <Lobby />
        <Tutorial />
      </>
    )
  }

  return (
    <div className="room-shell" style={{ background: sceneShell(scene) }}>
      <MapLoadWatch />
      <RoomScene key={`${scene}-${retry}`} />
      <Hud />
      <ReconnectBanner />
      <Tutorial />
    </div>
  )
}
