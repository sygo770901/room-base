import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH } from 'three'
import * as THREE from 'three'
import { rayOcclusion, SPAWN_POINTS } from '../../shared/dungeon'
import { NotePlacementPlane, StickyNotes3D } from './Furniture'
import { Dungeon } from './Dungeon'
import { HitEffects } from './HitEffects'
import { Monsters } from './Monsters'
import { LocalAvatar, RemotePlayers } from './Players'
import { LocalController } from './LocalController'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPAWN = SPAWN_POINTS[0] ?? { x: 80, z: 22 }

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

function FollowLight() {
  const light = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.PointLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const selfId = useAppStore((s) => s.selfId)
  const players = useAppStore((s) => s.players)

  useFrame(() => {
    const p = selfId ? players[selfId] : null
    const x = p?.position[0] ?? SPAWN.x
    const z = p?.position[2] ?? SPAWN.z
    if (light.current) {
      light.current.position.set(x + 10, 16, z + 8)
      target.position.set(x, 0, z)
      target.updateMatrixWorld()
    }
    fill.current?.position.set(x, 3.4, z)
  })

  return (
    <>
      <primitive object={target} />
      <pointLight ref={fill} color="#ffe2c4" intensity={36} distance={28} decay={2} />
      <directionalLight
        ref={light}
        castShadow
        intensity={1.6}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-camera-near={2}
        shadow-camera-far={36}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        target={target}
      />
    </>
  )
}

function CameraGuard() {
  const { camera, controls, gl, scene } = useThree()
  // priority > 0 會關掉 Fiber 的自動 render，這一層必須自己畫，否則畫布維持透明。
  useFrame(() => {
    const orbit = controls as { target?: THREE.Vector3 } | null
    const target = orbit?.target
    if (target) {
      const dx = camera.position.x - target.x
      const dy = camera.position.y - target.y
      const dz = camera.position.z - target.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist >= 1.25) {
        const inv = 1 / dist
        const hit = rayOcclusion(target.x, target.y, target.z, dx * inv, dy * inv, dz * inv, dist)
        if (hit < dist - 0.15) {
          const nd = Math.max(1.2, hit - 0.32)
          camera.position.set(target.x + (dx * inv) * nd, target.y + (dy * inv) * nd, target.z + (dz * inv) * nd)
        }
      }
    }
    gl.render(scene, camera)
  }, 1)
  return null
}

function SceneContent() {
  const selfId = useAppStore((s) => s.selfId)
  const players = useAppStore((s) => s.players)
  const notes = useAppStore((s) => s.notes)
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
      <color attach="background" args={['#1a1612']} />
      <fog attach="fog" args={['#1a1612', 28, 86]} />
      <hemisphereLight args={['#cbbba6', '#3a2c24', 1.25]} />
      <ambientLight intensity={0.8} />
      <FollowLight />

      <Suspense fallback={null}>
        <Dungeon />
        <Monsters />
      </Suspense>

      <StickyNotes3D notes={notes} selfId={selfId} isHost={isHost} />
      <NotePlacementPlane />

      <HitEffects />
      <RemotePlayers players={players} selfId={selfId} />
      {displaySelf && <LocalAvatar player={displaySelf} />}
      {self && (
        <LocalController
          player={self}
          onPose={(position, rotationY) => setLocalPose({ position, rotationY })}
        />
      )}

      <CameraGuard />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        minDistance={2.6}
        maxDistance={18}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI / 2.05}
        target={[SPAWN.x, 1.2, SPAWN.z]}
        mouseButtons={{
          LEFT: -1 as unknown as MOUSE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE,
        }}
        touches={{
          ONE: TOUCH.ROTATE,
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
      gl={{ toneMappingExposure: 1.35 }}
      camera={{ position: [SPAWN.x + 7, 9, SPAWN.z + 9], fov: 48, near: 0.1, far: 180 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <SceneContent />
    </Canvas>
  )
}
