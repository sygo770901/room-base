import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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

function BlockContextMenu() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const block = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', block)
    return () => el.removeEventListener('contextmenu', block)
  }, [gl])
  return null
}

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
      <BlockContextMenu />
      <color attach="background" args={['#c5d0d6']} />
      <fog attach="fog" args={['#d7e0e6', 22, 42]} />
      <hemisphereLight args={['#fff4e5', '#8d7356', 0.55]} />
      <ambientLight intensity={0.35} />
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
        enablePan={false}
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        minDistance={1.6}
        maxDistance={24}
        minPolarAngle={0.02}
        maxPolarAngle={Math.PI - 0.02}
        target={[-4.2, 0.9, 2.2]}
        mouseButtons={{
          LEFT: -1 as unknown as MOUSE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE,
        }}
        touches={{
          ONE: -1 as unknown as TOUCH,
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
