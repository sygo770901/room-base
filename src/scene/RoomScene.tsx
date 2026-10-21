import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { rayOcclusion } from '../../shared/dungeon'
import { heightTerrainBlocked } from '../../shared/heightlab'
import { heightFieldOf, spawnOf } from '../../shared/heightmaps'
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
import {
  OTS_CEILING_Y,
  OTS_CHEST_Y,
  OTS_AIM_AHEAD,
  OTS_ENTRY_PHI,
  OTS_HEIGHT_AIM,
  OTS_HEIGHT_AIM_DROP,
  OTS_HEIGHT_PHI,
  OTS_LOOK_Y,
  OTS_MAX_PHI,
  OTS_MAX_RADIUS,
  OTS_MIN_PHI,
  OTS_MIN_PULL,
  OTS_MIN_RADIUS,
  OTS_RIGHT,
  bodyViewBlocked,
  fitOtsCamera,
  heightCamRadius,
  otsCamera,
  otsThetaFromFacing,
} from '../../shared/camera'
import { groundY } from '../../shared/heightfield'
import { minimapYawFromForward } from '../../shared/minimap'
import { canvasDpr, isMobileDevice } from '../perf/device'
import { bindPointerLockWatch, exitGameLock, isAltHeld, isPointerInWindow, requestGameLock, setPointerInWindow } from './pointerLock'
import { typingInField } from './inputLock'
import { NotePlacementPlane, StickyNotes3D } from './Furniture'
import { DUNGEON_OCCLUSION, Dungeon } from './Dungeon'
import { meshSegmentBlocked } from './occlusion'
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
import { ModelBoundary } from './ModelBoundary'
import { fileLabel, sceneAssetUrls } from '../load/mapLoad'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

// Three.js 預設 minPolarAngle 是 0（頭頂正上方）、rotateSpeed 是 1（拖滿一整個螢幕等於轉 360°）。
// 這裡把垂直角鎖在斜上方到接近水平，旋轉改慢，避免短距離拖曳就被甩到頭頂。
const MIN_PHI = OTS_MIN_PHI

function phiLimits() {
  if (heightFieldOf(useAppStore.getState().scene)) return { min: OTS_HEIGHT_PHI, max: OTS_MAX_PHI }
  return { min: MIN_PHI, max: MAX_PHI }
}
const MAX_PHI = OTS_MAX_PHI
const MIN_RADIUS = OTS_MIN_RADIUS
const MAX_RADIUS = OTS_MAX_RADIUS
const ROTATE_SPEED = 0.3
const LOOK_Y = OTS_LOOK_Y

function MapProgressBridge() {
  const { errors } = useProgress()
  useEffect(() => {
    for (const url of errors) {
      if (url) useAppStore.getState().addMapLoadError(fileLabel(url))
    }
  }, [errors])
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
    const spawn = spawnOf(sceneId, 0)
    const x = p?.position?.[0] ?? spawn.x
    const z = p?.position?.[2] ?? spawn.z
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
      {!mobile && sceneId !== 'kaykit' && sceneId !== 'heightlab' && (
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
  const { camera, controls, gl, scene } = useThree()
  const saved = useRef({
    theta: otsThetaFromFacing(0),
    phi: heightFieldOf(useAppStore.getState().scene) ? OTS_HEIGHT_PHI : OTS_ENTRY_PHI,
    radius: useAppStore.getState().camDist,
    facingReady: false,
  })
  const camHold = useRef({ radius: useAppStore.getState().camDist, shoulder: OTS_RIGHT })
  const heightDistReady = useRef(false)
  const drag = useRef<{ id: number; x: number; y: number; mode: 'look' | 'zoom' } | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef(0)
  const skipLook = useRef(0)

  useEffect(() => {
    const el = gl.domElement
    const unwatch = bindPointerLockWatch(el)
    const arm = (scale: number) => {
      const cur = useAppStore.getState().camDist
      useAppStore.getState().setCamDist(cur * scale)
      saved.current.radius = useAppStore.getState().camDist
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
      if (e.button === 0 && !document.pointerLockElement) {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'look' }
      }
    }
    const lookLocked = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      if (skipLook.current > 0) {
        skipLook.current -= 1
        return
      }
      if (isAltHeld() || !isPointerInWindow()) return
      if (typingInField()) return
      const sens = useAppStore.getState().lookSensitivity
      const k = POINTER_LOOK_SCALE * sens
      const next = saved.current
      next.theta -= e.movementX * k
      const limits = phiLimits()
      next.phi = THREE.MathUtils.clamp(next.phi - e.movementY * k, limits.min, limits.max)
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
      const limits = phiLimits()
      next.phi = THREE.MathUtils.clamp(next.phi - dy * k, limits.min, limits.max)
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
    const onLock = () => {
      if (document.pointerLockElement) skipLook.current = 2
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
    document.addEventListener('pointerlockchange', onLock)
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
      document.removeEventListener('pointerlockchange', onLock)
    }
  }, [gl])

  // 角度只存在這裡。走路、擋牆拉近都不會寫回 theta/phi。
  useFrame((_, dt) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const shot = saved.current
    const st = useAppStore.getState()
    if (!shot.facingReady) {
      const me = st.selfId ? st.players[st.selfId] : null
      if (me) {
        shot.theta = otsThetaFromFacing(me.rotationY ?? 0)
        shot.facingReady = true
      }
    }
    const limits = phiLimits()
    shot.phi = THREE.MathUtils.clamp(shot.phi, limits.min, limits.max)
    const state = useAppStore.getState()
    const nav = heightFieldOf(state.scene)
    const storedRadius = THREE.MathUtils.clamp(st.camDist, MIN_RADIUS, MAX_RADIUS)
    const wantRadius = nav ? THREE.MathUtils.clamp(heightCamRadius(st.camDist), MIN_RADIUS, MAX_RADIUS) : storedRadius
    shot.radius = wantRadius
    if (nav && !heightDistReady.current) {
      camHold.current = { radius: wantRadius, shoulder: OTS_RIGHT }
      heightDistReady.current = true
    }
    let pose = otsCamera(target.x, target.y, target.z, shot.theta, shot.phi, shot.radius)
    if (nav) {
      const feetY = target.y - OTS_LOOK_Y
      const chestY = feetY + OTS_CHEST_Y
      const bodyY = [chestY, feetY + 0.55]
      const dungeon = scene.getObjectByName(DUNGEON_OCCLUSION)
      const blocked = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
        heightTerrainBlocked(nav, x0, y0, z0, x1, y1, z1) ||
        meshSegmentBlocked(dungeon ?? null, x0, y0, z0, x1, y1, z1)
      const fitted = fitOtsCamera({
        x: target.x,
        y: target.y,
        z: target.z,
        chestY,
        bodyY,
        theta: shot.theta,
        phi: shot.phi,
        radius: shot.radius,
        blocked,
      })
      const hold = camHold.current
      const holdPose = otsCamera(target.x, target.y, target.z, shot.theta, shot.phi, hold.radius, hold.shoulder)
      const holdBlocked = bodyViewBlocked(target.x, target.z, holdPose, bodyY, blocked)
      if (holdBlocked || fitted.radius < hold.radius - 0.001 || fitted.shoulder < hold.shoulder - 0.001) {
        hold.radius = fitted.radius
        hold.shoulder = fitted.shoulder
      } else if (fitted.radius > hold.radius + 0.3 || fitted.shoulder > hold.shoulder + 0.15) {
        const k = 1 - Math.exp(-4.5 * Math.min(0.05, Math.max(0, dt)))
        const nextRadius = Math.min(fitted.radius, hold.radius + (fitted.radius - hold.radius) * k)
        const nextShoulder = Math.min(fitted.shoulder, hold.shoulder + (fitted.shoulder - hold.shoulder) * k)
        const eased = otsCamera(target.x, target.y, target.z, shot.theta, shot.phi, nextRadius, nextShoulder)
        if (bodyViewBlocked(target.x, target.z, eased, bodyY, blocked)) {
          hold.radius = fitted.radius
          hold.shoulder = fitted.shoulder
        } else {
          hold.radius = nextRadius
          hold.shoulder = nextShoulder
        }
      }
      pose = otsCamera(
        target.x,
        target.y,
        target.z,
        shot.theta,
        shot.phi,
        hold.radius,
        hold.shoulder,
        OTS_HEIGHT_AIM,
        OTS_HEIGHT_AIM_DROP,
      )
    } else {
      let radius = shot.radius
      const extra = occludersOf(state.scene).concat(
        extraAabbsOf(state.scene).map((b) => ({ ...b, minY: 0, maxY: 4 })),
        closedDoorAabbs(state.doors, doorsOf(state.scene)).map((b) => ({ ...b, minY: 0, maxY: 3.2 })),
      )
      for (let i = 0; i < 2; i++) {
        const dx = pose.x - target.x
        const dy = pose.y - target.y
        const dz = pose.z - target.z
        const dist = Math.hypot(dx, dy, dz)
        if (dist < 1.25) break
        const hit = rayOcclusion(
          target.x,
          target.y,
          target.z,
          dx / dist,
          dy / dist,
          dz / dist,
          dist,
          extra,
          { skipCeilingY: OTS_CEILING_Y },
        )
        if (hit >= dist - 0.12) break
        const next = Math.max(OTS_MIN_PULL, Math.min(radius, hit - 0.28))
        if (next >= radius - 0.01) break
        radius = next
        pose = otsCamera(target.x, target.y, target.z, shot.theta, shot.phi, radius)
      }
    }
    camera.position.set(pose.x, pose.y, pose.z)
    camera.up.set(0, 1, 0)
    camera.lookAt(pose.aimX, pose.aimY, pose.aimZ)
    if (import.meta.env.DEV) {
      const slot = window as Window & {
        __pose?: { x: number; y: number; z: number; yaw: number }
        __cam?: { x: number; y: number; z: number; theta: number; phi: number; radius: number; shoulder: number }
      }
      slot.__cam = {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        theta: shot.theta,
        phi: shot.phi,
        radius: nav ? camHold.current.radius : shot.radius,
        shoulder: nav ? camHold.current.shoulder : OTS_RIGHT,
      }
    }
    useAppStore.getState().setLookYaw(minimapYawFromForward(pose.aimX - pose.x, pose.aimZ - pose.z))
  }, 0)
  return null
}

function CameraGuard() {
  const { camera, gl, scene } = useThree()
  const seen = useRef(0)
  const pixel = useRef(new Uint8Array(4))
  // priority > 0 會關掉 Fiber 的自動 render，這一層必須自己畫，否則畫布維持透明。
  useFrame(() => {
    const feel = useAppStore.getState()
    if (feel.sfxOn && performance.now() < feel.shakeUntil) {
      const t = (feel.shakeUntil - performance.now()) / 180
      const amp = feel.shakeAmp * Math.max(0, t)
      camera.position.x += (Math.random() - 0.5) * amp
      camera.position.y += (Math.random() - 0.5) * amp * 0.7
      camera.position.z += (Math.random() - 0.5) * amp
    }
    gl.render(scene, camera)
    if (feel.mapSceneReady || feel.scene !== 'heightlab') return
    const dungeon = scene.getObjectByName(DUNGEON_OCCLUSION)
    if (!dungeon || dungeon.children.length === 0) return
    const ctx = gl.getContext()
    const w = ctx.drawingBufferWidth
    const h = ctx.drawingBufferHeight
    if (w < 2 || h < 2) return
    const buf = pixel.current
    let varied = 0
    for (const [u, v] of [
      [0.5, 0.42],
      [0.32, 0.28],
      [0.5, 0.22],
      [0.22, 0.35],
      [0.68, 0.45],
    ]) {
      ctx.readPixels((u * (w - 1)) | 0, (v * (h - 1)) | 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, buf)
      if (Math.abs(buf[0] - 0x2a) > 22 || Math.abs(buf[1] - 0x24) > 22 || Math.abs(buf[2] - 0x28) > 22) varied += 1
    }
    seen.current = varied >= 2 ? seen.current + 1 : 0
    // 著色器編完、畫面不再是整片清空色，才收起進度卡。
    if (seen.current >= 2) useAppStore.getState().setMapSceneReady(true)
  }, 1)
  return null
}

function WarmOne({ url }: { url: string }) {
  useGLTF(url)
  return null
}

/** 場景裡會用到的 gltf 先在同一個 Suspense 裡解開。揮擊不會再觸發新的載入。 */
function WarmAssets({ urls }: { urls: string[] }) {
  return (
    <>
      {urls.map((url) => (
        <ModelBoundary key={url} file={url} fallback={null}>
          <WarmOne url={url} />
        </ModelBoundary>
      ))}
    </>
  )
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
  const spawn = spawnOf(sceneId, 0)
  const lookAt = useMemo(() => new THREE.Vector3(spawn.x, LOOK_Y + (heightFieldOf(sceneId) ? spawn.y : 0), spawn.z), [sceneId, spawn.x, spawn.y, spawn.z])
  const assetUrls = useMemo(() => sceneAssetUrls(sceneId), [sceneId])

  return (
    <>
      <BlockContextMenu />
      <color
        attach="background"
        args={[sceneId === 'jungle' ? '#1c2a1c' : sceneId === 'kaykit' || sceneId === 'heightlab' ? '#2a2428' : '#3a3544']}
      />
      <fog
        attach="fog"
        args={
          sceneId === 'jungle'
            ? ['#1c2a1c', 16, 62]
            : sceneId === 'kaykit' || sceneId === 'heightlab'
              ? ['#2a2428', 18, 70]
              : ['#3a3544', 28, 92]
        }
      />
      <hemisphereLight
        args={sceneId === 'jungle' ? ['#d8ecbe', '#2a3a24', 1.7] : ['#e4d6c4', '#3a2c24', 1.75]}
      />
      <ambientLight intensity={1.35} />
      <directionalLight position={[40, 60, 20]} intensity={0.55} color="#fff2d8" />
      <FollowLight mobile={isMobileDevice()} />

      <MapProgressBridge />
      <Suspense fallback={null}>
        <WarmAssets urls={assetUrls} />
        <DungeonBoundary>
          <Dungeon focusX={displaySelf?.position?.[0] ?? spawn.x} focusZ={displaySelf?.position?.[2] ?? spawn.z} />
        </DungeonBoundary>
        <ModelBoundary file="/assets/kaykit/dungeon-1.1/wall.gltf" fallback={null}>
          {sceneId === 'jungle' ? <JungleFoliage /> : null}
          <SceneDecor />
          <Monsters />
        </ModelBoundary>
        <ModelBoundary file="/assets/kaykit/barrel.gltf.glb" fallback={null}>
          <Barrels />
        </ModelBoundary>
        <ModelBoundary file="/assets/kaykit/adventurers/Ranger.glb" fallback={null}>
          <RemotePlayers players={players} selfId={selfId} />
        </ModelBoundary>
        {displaySelf?.position && <LocalAvatar player={displaySelf} />}
        <Doors />
      </Suspense>

      <StickyNotes3D notes={notes} selfId={selfId} isHost={isHost} />
      <NotePlacementPlane />

      <HitEffects />
      <Telegraph />
      <Projectiles />
      <SmokeClouds />
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

function sceneClear(sceneId: string) {
  if (sceneId === 'jungle') return '#1c2a1c'
  if (sceneId === 'kaykit' || sceneId === 'heightlab') return '#2a2428'
  return '#3a3544'
}

export function RoomScene() {
  const mobile = isMobileDevice()
  const sceneId = useAppStore((s) => s.scene)
  const spawn = spawnOf(sceneId, 0)
  const lookY = heightFieldOf(sceneId) ? spawn.y + OTS_LOOK_Y : OTS_LOOK_Y
  const bootRadius = heightFieldOf(sceneId) ? heightCamRadius(useAppStore.getState().camDist) : useAppStore.getState().camDist
  const heightBoot = heightFieldOf(sceneId)
  const bootPhi = heightBoot ? OTS_HEIGHT_PHI : OTS_ENTRY_PHI
  const bootTheta = otsThetaFromFacing(0)
  let boot = otsCamera(
    spawn.x,
    lookY,
    spawn.z,
    bootTheta,
    bootPhi,
    bootRadius,
    OTS_RIGHT,
    heightBoot ? OTS_HEIGHT_AIM : OTS_AIM_AHEAD,
    heightBoot ? OTS_HEIGHT_AIM_DROP : 0,
  )
  if (heightBoot) {
    const feet = groundY(heightBoot, spawn.x, spawn.z) ?? spawn.y
    const fitted = fitOtsCamera({
      x: spawn.x,
      y: feet + OTS_LOOK_Y,
      z: spawn.z,
      chestY: feet + OTS_CHEST_Y,
      bodyY: [feet + OTS_CHEST_Y, feet + 0.55],
      theta: bootTheta,
      phi: OTS_HEIGHT_PHI,
      radius: bootRadius,
      blocked: (x0, y0, z0, x1, y1, z1) => heightTerrainBlocked(heightBoot, x0, y0, z0, x1, y1, z1),
    })
    boot = otsCamera(
      spawn.x,
      feet + OTS_LOOK_Y,
      spawn.z,
      bootTheta,
      OTS_HEIGHT_PHI,
      fitted.radius,
      fitted.shoulder,
      OTS_HEIGHT_AIM,
      OTS_HEIGHT_AIM_DROP,
    )
  }
  return (
    <Canvas
      shadows={!mobile}
      dpr={canvasDpr(mobile)}
      gl={{
        toneMappingExposure: 1.35,
        powerPreference: 'high-performance',
        antialias: !mobile,
        alpha: false,
        preserveDrawingBuffer: true,
      }}
      camera={{ position: [boot.x, boot.y, boot.z], fov: 58, near: 0.05, far: 180 }}
      style={{ width: '100%', height: '100%', touchAction: 'none', background: sceneClear(useAppStore.getState().scene) }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(boot.aimX, boot.aimY, boot.aimZ)
        gl.setClearColor(sceneClear(useAppStore.getState().scene), 1)
      }}
    >
      <SceneContent />
    </Canvas>
  )
}
