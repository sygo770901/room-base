import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HIDE_RANGE, HIDE_SPOTS } from '../../shared/dungeon'
import { isMobileDevice } from '../perf/device'
import { WEAPON_STATS } from '../../shared/barrels'
import { DASH_DISTANCE, DASH_DURATION_MS, jumpCeilingFor, dashCooldownMs } from '../../shared/movement'
import { groundY } from '../../shared/heightfield'
import { heightFieldOf } from '../../shared/heightmaps'
import { GRAVITY, HIDE_MAX_Y, JUMP_SPEED, platformsFor, supportY } from '../../shared/platforms'
import { PLAYER_RADIUS } from '../../shared/furniture'
import { POOP_SLOW_MUL, SMOKE_RANGE, SMOKE_RANGE_MOBILE, smokeCooldownMs } from '../../shared/smoke'
import { emitDash, emitDoorToggle, emitFurniturePush, emitHide, emitJump, emitMove, emitRescueHold, emitSit, emitSmoke, performAttack } from '../net/socket'
import { isDowned, nearestDowned } from '../../shared/downed'
import { DOOR_AUTO_RANGE, DOOR_PROMPT_RANGE, closedDoorAabbs, inspectNearestDoor, nearestDoor } from '../../shared/doors'
import { OTS_LOOK_Y, heightWalkForward } from '../../shared/camera'
import { attackBlocked, hudBlocksPointer, pointerJustUnlocked, typingInField } from './inputLock'
import { resolvePlayerMove } from '../physics/collision'
import { doorsOf, extraAabbsOf } from '../../shared/mapData'
import { SAMPLE_BOUNDS, sampleWalkable } from '../../shared/sampleRoom'
import type { MoveSpace } from '../physics/collision'
import { useAppStore } from '../store'
import { livePose } from './livePose'
import type { PlayerState, Vec3 } from '../types'

const SPEED = 5.2

function moveSpace(sceneId: string): MoveSpace | undefined {
  if (sceneId !== 'sample') return undefined
  return { ...SAMPLE_BOUNDS, walkable: sampleWalkable }
}

const up = new THREE.Vector3(0, 1, 0)
const forward = new THREE.Vector3()
const right = new THREE.Vector3()

export function LocalController({
  player,
  onPose,
}: {
  player: PlayerState
  onPose: (position: Vec3, rotationY: number) => void
}) {
  const furniture = useAppStore((s) => s.furniture)
  const joy = useAppStore((s) => s.joy)
  const keys = useRef<Record<string, boolean>>({})
  const pos = useRef(
    new THREE.Vector3(player.position?.[0] ?? 0, player.position?.[1] ?? 0, player.position?.[2] ?? 0),
  )
  const vy = useRef(0)
  const grounded = useRef(true)
  const jumpPhase = useRef<'start' | 'idle' | 'land' | null>(null)
  const landUntil = useRef(0)
  const rotY = useRef(player.rotationY)
  const lastSent = useRef(0)
  const lastPush = useRef(0)
  const wasMoving = useRef(false)
  const seatedRef = useRef(player.seated)
  const furnitureRef = useRef(furniture)
  const joyRef = useRef(joy)
  const { camera, controls } = useThree()

  const respawnToken = useAppStore((s) => s.respawnToken)
  const poseSync = useAppStore((s) => s.poseSync)
  const tagHud = useAppStore((s) => s.tagHud)
  const mode = useAppStore((s) => s.mode)
  const hideUntilAt = useRef(0)
  const dash = useRef({ until: 0, dx: 0, dz: 0 })
  const lastDir = useRef({ x: 0, z: 1 })
  const dashRequest = useAppStore((s) => s.dashRequest)
  const jumpRequest = useAppStore((s) => s.jumpRequest)
  const smokeRequest = useAppStore((s) => s.smokeRequest)
  const lastAutoDoor = useRef<string | null>(null)

  seatedRef.current = player.seated
  furnitureRef.current = furniture
  joyRef.current = joy

  useEffect(() => {
    hideUntilAt.current = tagHud ? Date.now() + tagHud.hideLeftMs : 0
  }, [tagHud])

  useEffect(() => {
    const p = useAppStore.getState().players[player.id]
    if (!p?.position) return
    pos.current.set(p.position[0], p.position[1] ?? 0, p.position[2])
    vy.current = 0
    grounded.current = (p.position[1] ?? 0) <= 0.08
    rotY.current = p.rotationY
  }, [respawnToken, poseSync, player.id])

  useEffect(() => {
    if (!player.seated) return
    if (!player.position) return
    pos.current.set(...player.position)
    rotY.current = player.rotationY
  }, [player.seated, player.position?.[0], player.position?.[1], player.position?.[2], player.rotationY])

  function tryHide() {
    const state = useAppStore.getState()
    const me = state.players[player.id]
    if (!me || me.seated) return
    if (me.team === 'ghost' || me.team === 'spectator') {
      state.setToast(me.team === 'ghost' ? '鬼不能躲箱子' : '觀戰中')
      setTimeout(() => useAppStore.getState().setToast(null), 1600)
      return
    }
    if (me.hidden) {
      emitHide(false)
      state.patchPlayer(player.id, { hidden: false })
      return
    }
    if (pos.current.y > HIDE_MAX_Y) {
      state.setToast('站在地上才能躲')
      setTimeout(() => useAppStore.getState().setToast(null), 1600)
      return
    }
    const near = HIDE_SPOTS.some(
      (s) => Math.hypot(s.x - pos.current.x, s.z - pos.current.z) <= HIDE_RANGE,
    )
    if (!near) {
      state.setToast('靠近木箱、木桶或書櫃才能躲')
      setTimeout(() => useAppStore.getState().setToast(null), 1600)
      return
    }
    emitHide(true)
    state.patchPlayer(player.id, { hidden: true })
  }

  function tryDash() {
    const state = useAppStore.getState()
    const me = state.players[player.id]
    if (!me || me.seated || me.hidden || isDowned(me)) return
    if (me.team === 'spectator') return
    if ((state.mode === 'boss' || state.mode === 'tag') && !state.started) return
    if (state.mode === 'tag' && me.team === 'ghost' && (state.tagHud?.hideLeftMs ?? 0) > 0) {
      state.setToast('開場 30 秒內鬼不能衝')
      setTimeout(() => useAppStore.getState().setToast(null), 1400)
      return
    }
    const now = Date.now()
    if (now < state.dashReadyAt) return
    let dx = lastDir.current.x
    let dz = lastDir.current.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    dash.current = { until: performance.now() + DASH_DURATION_MS, dx, dz }
    state.setDash(player.id, now + DASH_DURATION_MS)
    state.setDashReadyAt(now + dashCooldownMs(me.team))
    emitDash(dx, dz)
  }

  function setPhase(next: 'start' | 'idle' | 'land' | null) {
    if (jumpPhase.current === next) return
    jumpPhase.current = next
    useAppStore.getState().setJumpPhase(player.id, next)
  }

  function tryJump() {
    const state = useAppStore.getState()
    const me = state.players[player.id]
    if (!me || me.seated || me.hidden || isDowned(me)) return
    if (me.team === 'spectator') return
    if (!grounded.current) return
    vy.current = JUMP_SPEED
    grounded.current = false
    setPhase('start')
    emitJump()
  }

  function trySmoke() {
    const state = useAppStore.getState()
    const me = state.players[player.id]
    if (!me || me.seated || me.hidden || isDowned(me)) return
    if (me.team === 'spectator') return
    if ((state.mode === 'boss' || state.mode === 'tag') && !state.started) return
    const now = Date.now()
    if (now < state.smokeReadyAt) return
    const range = isMobileDevice() ? SMOKE_RANGE_MOBILE : SMOKE_RANGE
    const len = Math.hypot(lastDir.current.x, lastDir.current.z) || 1
    const x = pos.current.x + (lastDir.current.x / len) * range
    const z = pos.current.z + (lastDir.current.z / len) * range
    state.setSmokeReadyAt(now + smokeCooldownMs(me.team))
    state.setThrowAt(player.id, now)
    emitSmoke(x, z)
  }

  useEffect(() => {
    if (dashRequest <= 0) return
    tryDash()
  }, [dashRequest])

  useEffect(() => {
    if (smokeRequest <= 0) return
    trySmoke()
  }, [smokeRequest])

  useEffect(() => {
    if (jumpRequest <= 0) return
    tryJump()
  }, [jumpRequest])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingInField()) return
      if (e.code === 'Escape' && pointerJustUnlocked()) {
        e.stopPropagation()
        return
      }
      keys.current[e.code] = true
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      if (e.code === 'KeyF') performAttack()
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash()
      if (e.code === 'Space') tryJump()
      if (e.code === 'KeyE') {
        const st = useAppStore.getState()
        const nearDowned = nearestDowned(player.id, pos.current.x, pos.current.z, Object.values(st.players))
        if (nearDowned) return
        if (seatedRef.current) void emitSit(null)
        else {
          const defs = doorsOf(st.scene)
          const near = nearestDoor(pos.current.x, pos.current.z, defs, DOOR_PROMPT_RANGE)
          const inspect = inspectNearestDoor(pos.current.x, pos.current.z, defs)
          console.log('[door] E', { x: pos.current.x, z: pos.current.z, scene: st.scene, near, inspect })
          if (near) emitDoorToggle(near.id, pos.current.x, pos.current.z)
          else tryHide()
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (hudBlocksPointer(e.target)) return
      const state = useAppStore.getState()
      if (state.pendingNote || state.noteAsk) return
      if (e.button === 2) {
        e.preventDefault()
        trySmoke()
        return
      }
      if (e.button !== 0) return
      if (attackBlocked()) return
      if (!isMobileDevice() && !document.pointerLockElement) return
      performAttack()
    }
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  // priority -2：OrbitControls 在 -1 才 update。先把鏡頭和平移到角色，
  // 它才只會套用手指轉的角度，走路本身不會把視角帶著轉。
  useFrame((_, dt) => {
    const orbit = controls as { target?: THREE.Vector3 } | null
    const stickCamera = (x: number, y: number, z: number) => {
      const target = orbit?.target
      if (!target) return
      const nav = heightFieldOf(useAppStore.getState().scene)
      const lookY = nav ? y + OTS_LOOK_Y : OTS_LOOK_Y + y * 0.12
      camera.position.x += x - target.x
      camera.position.y += lookY - target.y
      camera.position.z += z - target.z
      target.set(x, lookY, z)
    }

    if (typingInField()) {
      keys.current = {}
      stickCamera(pos.current.x, pos.current.y, pos.current.z)
      onPose([pos.current.x, pos.current.y, pos.current.z], rotY.current)
      useAppStore.getState().setLocalXZ(pos.current.x, pos.current.z)
      return
    }

    if (performance.now() < useAppStore.getState().hitStopUntil) {
      stickCamera(pos.current.x, pos.current.y, pos.current.z)
      onPose([pos.current.x, pos.current.y, pos.current.z], rotY.current)
      return
    }

    if (isDowned(player)) {
      stickCamera(pos.current.x, pos.current.y, pos.current.z)
      onPose([pos.current.x, pos.current.y, pos.current.z], rotY.current)
      return
    }

    if (keys.current.KeyE) {
      const tgt = nearestDowned(player.id, pos.current.x, pos.current.z, Object.values(useAppStore.getState().players))
      if (tgt) emitRescueHold(tgt.id)
    }

    if (player.seated && player.position) {
      stickCamera(player.position[0], player.position[1] ?? 0, player.position[2])
      onPose(player.position, player.rotationY)
      return
    }

    const frozen = mode === 'tag' && player.team === 'ghost' && Date.now() < hideUntilAt.current
    if (frozen) {
      stickCamera(pos.current.x, pos.current.y, pos.current.z)
      onPose([pos.current.x, pos.current.y, pos.current.z], rotY.current)
      return
    }

    const keyFwd =
      (keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) -
      (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0)
    const keyStrafe =
      (keys.current.KeyD || keys.current.ArrowRight ? 1 : 0) -
      (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0)

    const fwd = keyFwd || -joyRef.current.y
    const strafe = keyStrafe || joyRef.current.x

    if ((fwd !== 0 || strafe !== 0) && player.hidden) {
      emitHide(false)
      useAppStore.getState().patchPlayer(player.id, { hidden: false })
    }

    if (fwd !== 0 || strafe !== 0) {
      const sceneNow = useAppStore.getState().scene
      const navNow = heightFieldOf(sceneNow)
      const lookTarget = orbit?.target
      if (navNow && lookTarget) {
        // 越肩鏡頭站在側邊。用鏡頭朝向直接推人，會往肩膀那側漂，撞上高台邊緣。
        // 準心打在角色前方的水平面上，W 沿著角色到那個點走。
        camera.getWorldDirection(forward)
        const aim = heightWalkForward(
          camera.position.x,
          camera.position.y,
          camera.position.z,
          forward.x,
          forward.y,
          forward.z,
          lookTarget.x,
          lookTarget.y,
          lookTarget.z,
        )
        forward.set(aim.x, 0, aim.z)
      } else {
        camera.getWorldDirection(forward)
        forward.y = 0
      }
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1)
      forward.normalize()
      right.crossVectors(forward, up).normalize()

      const len = Math.hypot(fwd, strafe) || 1
      const held =
        player.weapon && (player.weaponUntil ?? 0) > Date.now() ? player.weapon : 'sword'
      const shotWalk = import.meta.env.DEV && new URLSearchParams(location.search).has('shot') ? 0.38 : 1
      const speedMul = WEAPON_STATS[held].speed * shotWalk
      const poopSlow = Date.now() < useAppStore.getState().poopSlowUntil ? POOP_SLOW_MUL : 1
      const mx = ((right.x * strafe) / len + (forward.x * fwd) / len) * SPEED * speedMul * poopSlow * dt
      const mz = ((right.z * strafe) / len + (forward.z * fwd) / len) * SPEED * speedMul * poopSlow * dt

      const sceneId = useAppStore.getState().scene
      const extra = extraAabbsOf(sceneId).concat(closedDoorAabbs(useAppStore.getState().doors, doorsOf(sceneId)))
      const plats = platformsFor(sceneId)
      const nav = heightFieldOf(sceneId)
      const space = moveSpace(sceneId)
      const result = resolvePlayerMove(
        pos.current.x,
        pos.current.z,
        mx,
        mz,
        furnitureRef.current,
        undefined,
        extra,
        pos.current.y,
        plats,
        nav,
        space,
      )
      const movedX = result.x - pos.current.x
      const movedZ = result.z - pos.current.z
      pos.current.x = result.x
      pos.current.z = result.z
      const inputX = (right.x * strafe) / len + (forward.x * fwd) / len
      const inputZ = (right.z * strafe) / len + (forward.z * fwd) / len
      if (nav) {
        // 貼牆滑動時不要把面向轉去牆。高度圖的面向跟著按鍵，不跟著被撞開的那一步。
        if (inputX !== 0 || inputZ !== 0) {
          rotY.current = Math.atan2(inputX, inputZ)
          lastDir.current = { x: inputX, z: inputZ }
        }
      } else if (movedX !== 0 || movedZ !== 0) {
        rotY.current = Math.atan2(movedX, movedZ)
        lastDir.current = { x: movedX, z: movedZ }
      }

      if (result.pushed) {
        const y = furnitureRef.current.find((f) => f.id === result.pushed!.id)?.position[1] ?? 0
        useAppStore.getState().patchFurniture(result.pushed.id, {
          position: [result.pushed.x, y, result.pushed.z],
        })
        const now = performance.now()
        if (now - lastPush.current > 80) {
          lastPush.current = now
          emitFurniturePush(result.pushed.id, [result.pushed.x, y, result.pushed.z])
        }
      }
    }

    const dashing = performance.now() < dash.current.until
    if (dashing) {
      const step = (DASH_DISTANCE / (DASH_DURATION_MS / 1000)) * dt
      const sceneId = useAppStore.getState().scene
      const extra = extraAabbsOf(sceneId).concat(closedDoorAabbs(useAppStore.getState().doors, doorsOf(sceneId)))
      const result = resolvePlayerMove(
        pos.current.x,
        pos.current.z,
        dash.current.dx * step,
        dash.current.dz * step,
        furnitureRef.current,
        undefined,
        extra,
        pos.current.y,
        platformsFor(sceneId),
        heightFieldOf(sceneId),
        moveSpace(sceneId),
      )
      pos.current.x = result.x
      pos.current.z = result.z
      rotY.current = Math.atan2(dash.current.dx, dash.current.dz)
    }

    const prevY = pos.current.y
    vy.current -= GRAVITY * dt
    pos.current.y += vy.current * dt
    const ceiling = jumpCeilingFor(useAppStore.getState().scene)
    if (pos.current.y > ceiling) {
      pos.current.y = ceiling
      if (vy.current > 0) vy.current = 0
    }
    const groundNav = heightFieldOf(useAppStore.getState().scene)
    const terrain = groundNav ? (groundY(groundNav, pos.current.x, pos.current.z) ?? 0) : 0
    const feet = supportY(
      pos.current.x,
      pos.current.z,
      pos.current.y,
      prevY,
      PLAYER_RADIUS,
      platformsFor(useAppStore.getState().scene),
      terrain,
    )
    if (pos.current.y <= feet && vy.current <= 0.05) {
      pos.current.y = feet
      vy.current = 0
      if (!grounded.current) {
        grounded.current = true
        setPhase('land')
        landUntil.current = performance.now() + 280
      } else if (performance.now() > landUntil.current) {
        setPhase(null)
      }
    } else {
      grounded.current = false
      if (vy.current > 1.2) setPhase('start')
      else setPhase('idle')
    }

    const st = useAppStore.getState()
    if (st.autoOpenDoors && st.mode !== 'tag' && !player.seated && player.team !== 'spectator') {
      const auto = nearestDoor(pos.current.x, pos.current.z, doorsOf(st.scene), DOOR_AUTO_RANGE)
      const doorState = auto ? st.doors.find((d) => d.id === auto.id) : null
      if (auto && (!doorState || !doorState.open) && lastAutoDoor.current !== auto.id) {
        lastAutoDoor.current = auto.id
        console.log('[door] auto', { id: auto.id, x: pos.current.x, z: pos.current.z })
        emitDoorToggle(auto.id, pos.current.x, pos.current.z, true)
      }
      if (!auto) lastAutoDoor.current = null
    }

    stickCamera(pos.current.x, pos.current.y, pos.current.z)

    const pose: Vec3 = [pos.current.x, pos.current.y, pos.current.z]
    livePose.x = pose[0]
    livePose.y = pose[1]
    livePose.z = pose[2]
    livePose.yaw = rotY.current
    livePose.ready = true
    if (import.meta.env.DEV) {
      const monsters = useAppStore.getState().monsters
      const slot = window as Window & {
        __pose?: { x: number; y: number; z: number; yaw: number; monsters: number }
        __mobs?: { id: string; x: number; z: number }[]
        __self?: string | null
      }
      slot.__pose = {
        x: pose[0],
        y: pose[1],
        z: pose[2],
        yaw: rotY.current,
        monsters: monsters.length,
      }
      slot.__mobs = monsters.filter((m) => m.alive).map((m) => ({ id: m.id, x: m.x, z: m.z }))
      slot.__self = useAppStore.getState().selfId
    }
    onPose(pose, rotY.current)
    useAppStore.getState().setLocalXZ(pose[0], pose[2])

    const now = performance.now()
    const moving = fwd !== 0 || strafe !== 0 || dashing || !grounded.current
    const interval = moving ? 50 : 200
    if (now - lastSent.current > interval) {
      lastSent.current = now
      wasMoving.current = moving
      emitMove(pose, rotY.current)
    } else if (!moving && wasMoving.current) {
      wasMoving.current = false
      lastSent.current = now
      emitMove(pose, rotY.current)
    }
  }, -2)

  return null
}
