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
// 0 是頭頂正上方，PI/2 是水平。鎖在這個範圍，避免走到牆邊時被拉到頭頂。
const MIN_PHI = 0.72
const MAX_PHI = 1.42
const rigOffset = new THREE.Vector3()
const rigSpherical = new THREE.Spherical()

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

function CameraRig() {
  const { camera, controls, gl } = useThree()
  const saved = useRef({ theta: 0, phi: 1, radius: 12, ready: false })
  const rotating = useRef(false)
  const zooming = useRef(false)
  const touchIds = useRef(new Set<number>())
  const wheeled = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touchIds.current.add(e.pointerId)
      else if (e.button === 2) rotating.current = true
      else if (e.button === 1) zooming.current = true
    }
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touchIds.current.delete(e.pointerId)
      else if (e.button === 2) rotating.current = false
      else if (e.button === 1) zooming.current = false
    }
    const wheel = () => {
      wheeled.current = true
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl])

  // OrbitControls 在 -1。這裡把走路、遮擋拉近造成的仰角改動蓋掉，只留下手指轉的角度。
  useFrame(() => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    rigOffset.copy(camera.position).sub(target)
    if (rigOffset.lengthSq() < 0.01) return
    rigSpherical.setFromVector3(rigOffset)
    const shot = saved.current
    const fingers = touchIds.current.size
    const looking = rotating.current || fingers === 1
    const pinching = fingers >= 2
    if (!shot.ready) {
      shot.theta = rigSpherical.theta
      shot.phi = THREE.MathUtils.clamp(rigSpherical.phi, MIN_PHI, MAX_PHI)
      shot.radius = THREE.MathUtils.clamp(rigSpherical.radius, 2.6, 18)
      shot.ready = true
    } else if (looking || pinching) {
      shot.theta = rigSpherical.theta
      shot.phi = THREE.MathUtils.clamp(rigSpherical.phi, MIN_PHI, MAX_PHI)
      if (pinching || zooming.current) {
        shot.radius = THREE.MathUtils.clamp(rigSpherical.radius, 2.6, 18)
      }
    } else if (zooming.current || wheeled.current) {
      shot.radius = THREE.MathUtils.clamp(rigSpherical.radius, 2.6, 18)
    }
    wheeled.current = false
    rigSpherical.theta = shot.theta
    rigSpherical.phi = shot.phi
    rigSpherical.radius = shot.radius
    rigOffset.setFromSpherical(rigSpherical)
    camera.position.copy(target).add(rigOffset)
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
  }, 0)
  return null
}

function CameraGuard() {
  const { camera, controls, gl, scene } = useThree()
  // priority > 0 會關掉 Fiber 的自動 render，這一層必須自己畫，否則畫布維持透明。
  useFrame((_, dt) => {
    const orbit = controls as { target?: THREE.Vector3 } | null
    const target = orbit?.target
    if (target) {
      const dx = camera.position.x - target.x
      const dy = camera.position.y - target.y
      const dz = camera.position.z - target.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist >= 1.25) {
        const inv = 1 / dist
        const dirx = dx * inv
        const diry = dy * inv
        const dirz = dz * inv
        const hit = rayOcclusion(target.x, target.y, target.z, dirx, diry, dirz, dist)
        if (hit < dist - 0.15) {
          const desired = Math.max(1.2, hit - 0.32)
          const nd = THREE.MathUtils.damp(dist, desired, 8, dt)
          camera.position.set(target.x + dirx * nd, target.y + diry * nd, target.z + dirz * nd)
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
  const lookAt = useMemo(() => new THREE.Vector3(SPAWN.x, 0.9, SPAWN.z), [])

  return (
    <>
      <BlockContextMenu />
      <color attach="background" args={['#3a3544']} />
      <fog attach="fog" args={['#3a3544', 28, 92]} />
      <hemisphereLight args={['#cbbba6', '#3a2c24', 1.25]} />
      <ambientLight intensity={0.8} />
      <FollowLight />

      <Suspense fallback={null}>
        <Dungeon focusX={displaySelf?.position[0] ?? SPAWN.x} focusZ={displaySelf?.position[2] ?? SPAWN.z} />
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

      <CameraRig />
      <CameraGuard />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableRotate
        enableDamping={false}
        rotateSpeed={0.82}
        minDistance={2.6}
        maxDistance={18}
        minPolarAngle={MIN_PHI}
        maxPolarAngle={MAX_PHI}
        target={lookAt}
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
