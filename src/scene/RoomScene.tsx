import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { rayOcclusion, SPAWN_POINTS } from '../../shared/dungeon'
import { KAYKIT_TORCHES } from '../../shared/kaykitScene'
import { doorsOf, extraAabbsOf, occludersOf, usesKaykitKit } from '../../shared/mapData'
import { closedDoorAabbs } from '../../shared/doors'
import {
  DESKTOP_DYNAMIC_POINT_LIGHTS,
  DESKTOP_SHADOW_MAP,
  TORCH_LIGHT_FADE,
  TORCH_LIGHT_INTENSITY,
  TORCH_LIGHT_RANGE,
} from '../../shared/perf'
import { POINTER_LOOK_SCALE } from '../../shared/input'
import { canvasDpr, isMobileDevice } from '../perf/device'
import { bindPointerLockWatch, exitGameLock, isAltHeld, isPointerInWindow, requestGameLock, setPointerInWindow } from './pointerLock'
import { typingInField } from './inputLock'
import { NotePlacementPlane, StickyNotes3D } from './Furniture'
import { Dungeon } from './Dungeon'
import { DungeonBoundary } from './DungeonBoundary'
import { JungleFoliage } from './JungleFoliage'
import { SceneDecor } from './Decor'
import { HitEffects } from './HitEffects'
import { Telegraph } from './Telegraph'
import { Projectiles } from './Projectiles'
import { Monsters } from './Monsters'
import { LocalAvatar, RemotePlayers } from './Players'
import { LocalController } from './LocalController'
import { SmokeClouds } from './SmokeClouds'
import { Barrels } from './Barrels'
import { Doors } from './Doors'
import { bindMapLoadWatchdog, preloadSceneModels, reportMapProgress } from '../load/mapLoad'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPAWN = SPAWN_POINTS[0] ?? { x: 80, z: 22 }
// Three.js 預設 minPolarAngle 是 0（頭頂正上方）、rotateSpeed 是 1（拖滿一整個螢幕等於轉 360°）。
// 這裡把垂直角鎖在斜上方到接近水平，旋轉改慢，避免短距離拖曳就被甩到頭頂。
const MIN_PHI = 1.12
const MAX_PHI = 1.48
const MIN_RADIUS = 1.8
const MAX_RADIUS = 2.8
const ROTATE_SPEED = 0.3
const SHOULDER_DIST = 2.25
const SHOULDER_RIGHT = 0.58
const LOOK_Y = 1.08
const rigOffset = new THREE.Vector3()
const rigSpherical = new THREE.Spherical()

function MapProgressBridge() {
  const sceneId = useAppStore((s) => s.scene)
  const { active, progress, errors, loaded, total } = useProgress()
  useEffect(() => {
    preloadSceneModels(sceneId)
    return bindMapLoadWatchdog()
  }, [sceneId])
  useEffect(() => {
    reportMapProgress(progress, loaded, total, active, errors.length)
  }, [active, progress, errors, loaded, total])
  return null
}

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

function FollowLight({ mobile }: { mobile: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.PointLight>(null)
  const torches = useRef<(THREE.PointLight | null)[]>([])
  const target = useMemo(() => new THREE.Object3D(), [])
  const selfId = useAppStore((s) => s.selfId)
  const players = useAppStore((s) => s.players)
  const sceneId = useAppStore((s) => s.scene)
  const ranked = useMemo(() => [] as { x: number; y: number; z: number; d: number }[], [])

  useFrame(() => {
    const p = selfId ? players[selfId] : null
    const x = p?.position?.[0] ?? SPAWN.x
    const z = p?.position?.[2] ?? SPAWN.z
    if (light.current) {
      light.current.position.set(x + 10, 16, z + 8)
      target.position.set(x, 0, z)
      target.updateMatrixWorld()
    }
    fill.current?.position.set(x, 3.4, z)

    if (mobile || !usesKaykitKit(sceneId)) return
    ranked.length = 0
    for (const t of KAYKIT_TORCHES) {
      ranked.push({ ...t, d: Math.hypot(t.x - x, t.z - z) })
    }
    ranked.sort((a, b) => a.d - b.d)
    for (let i = 0; i < DESKTOP_DYNAMIC_POINT_LIGHTS; i++) {
      const lamp = torches.current[i]
      const src = ranked[i]
      if (!lamp || !src) continue
      const fadeStart = TORCH_LIGHT_RANGE - TORCH_LIGHT_FADE
      const w =
        src.d >= TORCH_LIGHT_RANGE ? 0 : src.d <= fadeStart ? 1 : 1 - (src.d - fadeStart) / TORCH_LIGHT_FADE
      lamp.position.set(src.x, src.y, src.z)
      lamp.intensity = TORCH_LIGHT_INTENSITY * w
    }
  })

  return (
    <>
      <primitive object={target} />
      {!mobile && sceneId !== 'kaykit' && (
        <pointLight ref={fill} color="#ffe2c4" intensity={36} distance={28} decay={2} />
      )}
      {!mobile &&
        sceneId === 'kaykit' &&
        Array.from({ length: DESKTOP_DYNAMIC_POINT_LIGHTS }, (_, i) => (
          <pointLight
            key={i}
            ref={(el) => {
              torches.current[i] = el
            }}
            color="#ffb366"
            intensity={0}
            distance={14}
            decay={2}
          />
        ))}
      <directionalLight
        ref={light}
        castShadow={!mobile}
        intensity={mobile ? 1.15 : 1.6}
        shadow-mapSize-width={DESKTOP_SHADOW_MAP}
        shadow-mapSize-height={DESKTOP_SHADOW_MAP}
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
  const saved = useRef({ theta: 0.8, phi: 1.28, radius: SHOULDER_DIST, ready: false })
  const drag = useRef<{ id: number; x: number; y: number; mode: 'look' | 'zoom' } | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef(0)

  useEffect(() => {
    const el = gl.domElement
    const unwatch = bindPointerLockWatch(el)
    const arm = (scale: number) => {
      const next = saved.current
      next.radius = THREE.MathUtils.clamp(next.radius * scale, MIN_RADIUS, MAX_RADIUS)
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
      if (e.button === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'zoom' }
    }
    const lookLocked = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      if (isAltHeld() || !isPointerInWindow()) return
      if (typingInField()) return
      const sens = useAppStore.getState().lookSensitivity
      const k = POINTER_LOOK_SCALE * sens
      const next = saved.current
      next.theta -= e.movementX * k
      next.phi = THREE.MathUtils.clamp(next.phi - e.movementY * k, MIN_PHI, MAX_PHI)
    }
    const click = (e: MouseEvent) => {
      if (e.button !== 0) return
      requestGameLock(el, e.target)
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
    const onBlur = () => setPointerInWindow(false)
    const onFocus = () => setPointerInWindow(true)
    el.addEventListener('pointerdown', down)
    el.addEventListener('click', click)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointermove', move)
    window.addEventListener('mousemove', lookLocked)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    const onVis = () => {
      if (document.hidden) setPointerInWindow(false)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      unwatch()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('click', click)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('mousemove', lookLocked)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
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
    shot.radius = THREE.MathUtils.clamp(shot.radius, MIN_RADIUS, MAX_RADIUS)
    shot.phi = THREE.MathUtils.clamp(shot.phi, MIN_PHI, MAX_PHI)
    rigSpherical.set(shot.radius, shot.phi, shot.theta)
    rigOffset.setFromSpherical(rigSpherical)
    camera.position.copy(target).add(rigOffset)
    const fwd = new THREE.Vector3().subVectors(target, camera.position).setY(0)
    if (fwd.lengthSq() > 1e-6) {
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
      camera.position.addScaledVector(right, SHOULDER_RIGHT)
    }
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
    useAppStore.getState().setLookYaw(Math.atan2(target.x - camera.position.x, target.z - camera.position.z))
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
        const state = useAppStore.getState()
        const extra = occludersOf(state.scene).concat(
          extraAabbsOf(state.scene).map((b) => ({ ...b, minY: 0, maxY: 4 })),
          closedDoorAabbs(state.doors, doorsOf(state.scene)).map((b) => ({ ...b, minY: 0, maxY: 3.2 })),
        )
        const hit = rayOcclusion(target.x, target.y, target.z, dirx, diry, dirz, dist, extra)
        if (hit < dist - 0.12) {
          const desired = Math.max(0.85, hit - 0.28)
          if (desired < dist) {
            const nd = THREE.MathUtils.damp(dist, desired, 10, dt)
            camera.position.set(target.x + dirx * nd, target.y + diry * nd, target.z + dirz * nd)
          }
        }
      }
    }
    const feel = useAppStore.getState()
    if (feel.sfxOn && performance.now() < feel.shakeUntil) {
      const t = (feel.shakeUntil - performance.now()) / 180
      const amp = feel.shakeAmp * Math.max(0, t)
      camera.position.x += (Math.random() - 0.5) * amp
      camera.position.y += (Math.random() - 0.5) * amp * 0.7
      camera.position.z += (Math.random() - 0.5) * amp
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
  const lookAt = useMemo(() => new THREE.Vector3(SPAWN.x, LOOK_Y, SPAWN.z), [])

  return (
    <>
      <BlockContextMenu />
      <color attach="background" args={[sceneId === 'jungle' ? '#1c2a1c' : sceneId === 'kaykit' ? '#2a2428' : '#3a3544']} />
      <fog
        attach="fog"
        args={
          sceneId === 'jungle' ? ['#1c2a1c', 16, 62] : sceneId === 'kaykit' ? ['#2a2428', 18, 70] : ['#3a3544', 28, 92]
        }
      />
      <hemisphereLight
        args={sceneId === 'jungle' ? ['#d8ecbe', '#2a3a24', 1.7] : ['#e4d6c4', '#3a2c24', 1.75]}
      />
      <ambientLight intensity={1.35} />
      <directionalLight position={[40, 60, 20]} intensity={0.55} color="#fff2d8" />
      <FollowLight mobile={isMobileDevice()} />

      <MapProgressBridge />
      <DungeonBoundary>
        <Suspense fallback={null}>
          <Dungeon focusX={displaySelf?.position?.[0] ?? SPAWN.x} focusZ={displaySelf?.position?.[2] ?? SPAWN.z} />
        </Suspense>
      </DungeonBoundary>
      <Suspense fallback={null}>
        {sceneId === 'jungle' ? <JungleFoliage /> : null}
        <SceneDecor />
        <Monsters />
      </Suspense>

      <StickyNotes3D notes={notes} selfId={selfId} isHost={isHost} />
      <NotePlacementPlane />

      <HitEffects />
      <Telegraph />
      <Projectiles />
      <Doors />
      <SmokeClouds />
      <Suspense fallback={null}>
        <Barrels />
      </Suspense>
      <Suspense fallback={null}>
        <RemotePlayers players={players} selfId={selfId} />
      </Suspense>
      {displaySelf?.position && <LocalAvatar player={displaySelf} />}
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
  const mobile = isMobileDevice()
  const cameraPos: [number, number, number] = [SPAWN.x + 1.2, 1.7, SPAWN.z + 1.8]
  return (
    <Canvas
      shadows={!mobile}
      dpr={canvasDpr(mobile)}
      gl={{
        toneMappingExposure: 1.35,
        powerPreference: 'high-performance',
        antialias: !mobile,
      }}
      camera={{ position: cameraPos, fov: 58, near: 0.05, far: 180 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <SceneContent />
    </Canvas>
  )
}
