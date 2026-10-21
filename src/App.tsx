import { Component, useEffect, useRef, type ReactNode } from 'react'
import { Lobby } from './ui/Lobby'
import { Hud } from './ui/Hud'
import { DamageReadout } from './ui/DamageReadout'
import { ReconnectBanner } from './ui/ReconnectBanner'
import { Tutorial } from './ui/Tutorial'
import { RoomScene } from './scene/RoomScene'
import { bindLoadErrorWatch, startCriticalPreload } from './load/mapLoad'
import { resumeSessionIfNeeded } from './net/socket'
import { unlockSfx } from './audio/sfx'
import { useAppStore } from './store'

/** 畫布裡的模型錯誤停在這一層，大廳外殼和載入失敗提示還在。 */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    useAppStore.getState().addMapLoadError(error?.message || '場景')
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function sceneShell(scene: string) {
  if (scene === 'jungle') return '#1c2a1c'
  if (scene === 'kaykit' || scene === 'heightlab') return '#2a2428'
  return '#3a3544'
}

function MapLoadWatch() {
  const scene = useAppStore((s) => s.scene)
  const retry = useAppStore((s) => s.mapLoadRetry)
  const phase = useAppStore((s) => s.phase)
  const seenRetry = useRef(retry)
  useEffect(() => {
    if (phase !== 'room') return
    const clearCache = retry !== seenRetry.current
    seenRetry.current = retry
    const stopWatch = bindLoadErrorWatch()
    const stopPreload = startCriticalPreload(scene, clearCache)
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
      <SceneErrorBoundary key={`${scene}-${retry}`}>
        <RoomScene />
      </SceneErrorBoundary>
      <Hud />
      <DamageReadout />
      <ReconnectBanner />
      <Tutorial />
    </div>
  )
}
