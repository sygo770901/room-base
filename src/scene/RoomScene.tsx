import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH } from 'three'
import {
  BedroomFurniture,
  NotePlacementPlane,
  RoomShell,
  SeatMarkers,
  StickyNotes3D,
} from './Furniture'
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
  const followCam = useAppStore((s) => s.followCam)
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
      <fog attach="fog" args={['#d7e0e6', 22, 42]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[8, 14, 6]}
        intensity={1.25}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={40}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
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

      <NotePlacementPlane />

      <RemotePlayers players={players} selfId={selfId} />
      {displaySelf && <LocalAvatar player={displaySelf} />}
      {self && (
        <LocalController
          player={self}
          onPose={(position, rotationY) => setLocalPose({ position, rotationY })}
        />
      )}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.3} scale={28} blur={2.4} />

      <OrbitControls
        makeDefault
        enabled={!followCam}
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.05}
        target={[-1, 0.6, 0]}
        mouseButtons={{
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE,
        }}
        touches={{
          ONE: TOUCH.PAN,
          TWO: TOUCH.DOLLY_ROTATE,
        }}
      />
    </>
  )
}

export function RoomScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 9, 10], fov: 42 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <SceneContent />
    </Canvas>
  )
}
