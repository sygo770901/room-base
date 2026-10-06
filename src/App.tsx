import { Lobby } from './ui/Lobby'
import { Hud } from './ui/Hud'
import { RoomScene } from './scene/RoomScene'
import { useAppStore } from './store'

export default function App() {
  const phase = useAppStore((s) => s.phase)

  if (phase === 'lobby') return <Lobby />

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <RoomScene />
      <Hud />
    </div>
  )
}
