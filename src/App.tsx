import { useEffect } from 'react'
import { Lobby } from './ui/Lobby'
import { Hud } from './ui/Hud'
import { ReconnectBanner } from './ui/ReconnectBanner'
import { RoomScene } from './scene/RoomScene'
import { resumeSessionIfNeeded } from './net/socket'
import { useAppStore } from './store'

export default function App() {
  const phase = useAppStore((s) => s.phase)

  useEffect(() => {
    resumeSessionIfNeeded()
  }, [])

  if (phase === 'lobby') return <Lobby />

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <RoomScene />
      <Hud />
      <ReconnectBanner />
    </div>
  )
}
