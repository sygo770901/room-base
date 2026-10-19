import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { rayOcclusion, SPAWN_POINTS } from '../../shared/dungeon'
import { KAYKIT_OCCLUDERS } from '../../shared/kaykitScene'
import { NotePlacementPlane, StickyNotes3D } from './Furniture'
import { Dungeon } from './Dungeon'
import { HitEffects } from './HitEffects'
import { Telegraph } from './Telegraph'
import { Monsters } from './Monsters'
import { LocalAvatar, RemotePlayers } from './Players'
import { LocalController } from './LocalController'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPAWN = SPAWN_POINTS[0] ?? { x: 80, z: 22 }
// Three.js 預設 minPolarAngle 是 0（頭頂正上方）、rotateSpeed 是 1（拖滿一整個螢幕等於轉 360°）。
// 這裡把垂直角鎖在斜上方到接近水平，旋轉改慢，避免短距離拖曳就被甩到頭頂。
const MIN_PHI = 0.85
const MAX_PHI = 1.35
const MIN_RADIUS = 4.2
const MAX_RADIUS = 14
const ROTATE_SPEED = 0.3
// 天花板底在 y=4。鏡頭若沿斜上方向被牆擋檢測拉近，會貼進天花板裡。
// KayKit 改把俯角放平、距離縮到天花板底下，不把鏡頭推進石磚。
const KAYKIT_CAM_Y = 3.2
const KAYKIT_MAX_RADIUS = 10.5
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
  const saved = useRef({ theta: 0.8, phi: 1.05, radius: 12, ready: false })
  const drag = useRef<{ id: number; x: number; y: number; mode: 'look' | 'zoom' } | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef(0)

  useEffect(() => {
    const el = gl.domElement
    const arm = (scale: number) => {
      const next = saved.current
      const maxR = useAppStore.getState().scene === 'kaykit' ? KAYKIT_MAX_RADIUS : MAX_RADIUS
      next.radius = THREE.MathUtils.clamp(next.radius * scale, MIN_RADIUS, maxR)
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.current.size === 1) {
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'look' }
          pinchDist.current = 0
        } else {
          drag.current = null
          const pts = [...touches.current.values()]
          pinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        }
        return
      }
      if (e.button === 2) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'look' }
      else if (e.button === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'zoom' }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      if (touches.current.size >= 2) {
        const pts = [...touches.current.values()]
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (pinchDist.current > 0) arm(dist / pinchDist.current)
        pinchDist.current = dist
        return
      }
      const active = drag.current
      if (!active || e.pointerId !== active.id) return
      const dx = e.clientX - active.x
      const dy = e.clientY - active.y
      active.x = e.clientX
      active.y = e.clientY
      if (active.mode === 'zoom') {
        arm(Math.exp(dy * 0.004))
        return
      }
      const k = (2 * Math.PI * ROTATE_SPEED) / (el.clientHeight || 1)
      const next = saved.current
      next.theta -= dx * k
      next.phi = THREE.MathUtils.clamp(next.phi - dy * k, MIN_PHI, MAX_PHI)
    }
    const up = (e: PointerEvent) => {
      touches.current.delete(e.pointerId)
      if (drag.current?.id === e.pointerId) drag.current = null
      if (touches.current.size === 1) {
        const [id, point] = [...touches.current.entries()][0]
        drag.current = { id, x: point.x, y: point.y, mode: 'look' }
        pinchDist.current = 0
      }
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      arm(e.deltaY > 0 ? 1.08 : 0.92)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl])

  // 角度只存在這裡。走路、擋牆拉近都不會寫回 theta/phi。
  useFrame(() => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const shot = saved.current
    if (!shot.ready) {
      rigOffset.copy(camera.position).sub(target)
      if (rigOffset.lengthSq() > 0.01) {
        rigSpherical.setFromVector3(rigOffset)
        shot.theta = rigSpherical.theta
        shot.phi = THREE.MathUtils.clamp(rigSpherical.phi, MIN_PHI, MAX_PHI)
        shot.radius = THREE.MathUtils.clamp(rigSpherical.radius, MIN_RADIUS, MAX_RADIUS)
        shot.ready = true
      }
    }
    if (useAppStore.getState().scene === 'kaykit') {
      const maxR = KAYKIT_MAX_RADIUS
      shot.radius = THREE.MathUtils.clamp(shot.radius, MIN_RADIUS, maxR)
      const rise = KAYKIT_CAM_Y - target.y
      const flattest = Math.cos(MAX_PHI)
      if (shot.radius * flattest > rise) shot.radius = rise / flattest
      const phiFloor = Math.acos(THREE.MathUtils.clamp(rise / shot.radius, -1, 1))
      if (shot.phi < phiFloor) shot.phi = phiFloor
      shot.phi = THREE.MathUtils.clamp(shot.phi, MIN_PHI, MAX_PHI)
    }
    rigSpherical.set(shot.radius, shot.phi, shot.theta)
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
        const extra = useAppStore.getState().scene === 'kaykit' ? KAYKIT_OCCLUDERS : []
        const hit = rayOcclusion(target.x, target.y, target.z, dirx, diry, dirz, dist, extra)
        if (hit < dist - 0.2) {
          const desired = Math.max(MIN_RADIUS, hit - 0.45)
          if (desired < dist) {
            const nd = THREE.MathUtils.damp(dist, desired, 3, dt)
            camera.position.set(target.x + dirx * nd, target.y + diry * nd, target.z + dirz * nd)
          }
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
  const sceneId = useAppStore((s) => s.scene)
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
      <color attach="background" args={[sceneId === 'kaykit' ? '#2a2428' : '#3a3544']} />
      <fog attach="fog" args={sceneId === 'kaykit' ? ['#2a2428', 18, 70] : ['#3a3544', 28, 92]} />
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
      <Telegraph />
      <Suspense fallback={null}>
        <RemotePlayers players={players} selfId={selfId} />
        {displaySelf && <LocalAvatar player={displaySelf} />}
      </Suspense>
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
        enabled={false}
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
        enableDamping={false}
        target={lookAt}
      />
    </>
  )
}

export function RoomScene() {
  const kaykit = useAppStore((s) => s.scene) === 'kaykit'
  const cameraPos: [number, number, number] = kaykit
    ? [SPAWN.x + 5.5, KAYKIT_CAM_Y, SPAWN.z + 6.8]
    : [SPAWN.x + 7, 9, SPAWN.z + 9]
  return (
    <Canvas
      shadows
      gl={{ toneMappingExposure: 1.35 }}
      camera={{ position: cameraPos, fov: 48, near: 0.1, far: 180 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <SceneContent />
    </Canvas>
  )
}
