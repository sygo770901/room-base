import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment } from '@react-three/drei'
import { BedroomFurniture, RoomShell, SeatMarkers, StickyNotes3D } from './Furniture'
import { LocalAvatar, RemotePlayers } from './Players'
import { LocalController } from './LocalController'
import { useAppStore } from '../store'
import { emitRemoveNote, emitSit } from '../net/socket'
import type { PlayerState, Vec3 } from '../types'

function SceneContent() {
  const selfId = useAppStore((s) => s.selfId)
  const players = useAppStore((s) => s.players)
  const seats = useAppStore((s) => s.seats)
  const notes = useAppStore((s) => s.notes)
  const furniture = useAppStore((s) => s.furniture)
  const hostId = useAppStore((s) => s.hostId)
  const [localPose, setLocalPose] = useState<{ position: Vec3; rotationY: number } | null>(null)

  const self = selfId ? players[selfId] : null
  const displaySelf: PlayerState | null = useMemo(() => {
    if (!self) return null
    if (!localPose || self.seated) return self
    return { ...self, position: localPose.position, rotationY: localPose.rotationY }
  }, [self, localPose])

  const isHost = !!selfId && hostId === selfId

  return (
    <>
      <color attach="background" args={['#d7e0e6']} />
      <fog attach="fog" args={['#d7e0e6', 14, 28]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[4, 8, 3]}
        intensity={1.25}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Environment preset="apartment" />

      <RoomShell />
      <Suspense fallback={null}>
        <BedroomFurniture />
      </Suspense>

      <SeatMarkers
        seats={seats}
        furniture={furniture}
        selfId={selfId}
        onSit={async (seatId) => {
          const currently = self?.seated
          const result = await emitSit(currently === seatId ? null : seatId)
          if (!result.ok) {
            useAppStore.getState().setToast(result.reason || '無法坐下')
            setTimeout(() => useAppStore.getState().setToast(null), 2200)
          }
        }}
      />

      <StickyNotes3D
        notes={notes}
        selfId={selfId}
        isHost={isHost}
        onRemove={(id) => emitRemoveNote(id)}
      />

      <RemotePlayers players={players} selfId={selfId} />
      {displaySelf && <LocalAvatar player={displaySelf} />}
      {self && (
        <LocalController
          player={self}
          onPose={(position, rotationY) => setLocalPose({ position, rotationY })}
        />
      )}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.35} scale={10} blur={2.2} />
    </>
  )
}

export function RoomScene() {
  return (
    <Canvas shadows camera={{ position: [3.2, 4.2, 3.8], fov: 40 }} style={{ width: '100%', height: '100%' }}>
      <SceneContent />
    </Canvas>
  )
}
