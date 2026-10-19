import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HIDE_RANGE, HIDE_SPOTS } from '../../shared/dungeon'
import { isMobileDevice } from '../perf/device'
import { WEAPON_STATS } from '../../shared/barrels'
import { DASH_DISTANCE, DASH_DURATION_MS, dashCooldownMs } from '../../shared/movement'
import { SMOKE_RANGE, SMOKE_RANGE_MOBILE, smokeCooldownMs } from '../../shared/smoke'
import { emitDash, emitFurniturePush, emitHide, emitMove, emitSit, emitSmoke, performAttack } from '../net/socket'
import { attackBlocked, hudBlocksPointer, pointerJustUnlocked, typingInField } from './inputLock'
import { resolvePlayerMove, KAYKIT_EXTRA_AABBS } from '../physics/collision'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPEED = 5.2
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
  const pos = useRef(new THREE.Vector3(...(player.position ?? [0, 0, 0])))
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
  const smokeRequest = useAppStore((s) => s.smokeRequest)

  seatedRef.current = player.seated
  furnitureRef.current = furniture
  joyRef.current = joy

  useEffect(() => {
    hideUntilAt.current = tagHud ? Date.now() + tagHud.hideLeftMs : 0
  }, [tagHud])

  useEffect(() => {
    const p = useAppStore.getState().players[player.id]
    if (!p?.position) return
    pos.current.set(p.position[0], 0, p.position[2])
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
    if (!me || me.seated || me.hidden) return
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

  function trySmoke() {
    const state = useAppStore.getState()
    const me = state.players[player.id]
    if (!me || me.seated || me.hidden) return
    if (me.team === 'spectator') return
    if ((state.mode === 'boss' || state.mode === 'tag') && !state.started) return
    const now = Date.now()
    if (now < state.smokeReadyAt) return
    const range = isMobileDevice() ? SMOKE_RANGE_MOBILE : SMOKE_RANGE
    const len = Math.hypot(lastDir.current.x, lastDir.current.z) || 1
    const x = pos.current.x + (lastDir.current.x / len) * range
    const z = pos.current.z + (lastDir.current.z / len) * range
    state.setSmokeReadyAt(now + smokeCooldownMs(me.team))
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
      if (e.code === 'KeyE') {
        if (seatedRef.current) void emitSit(null)
        else tryHide()
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
    const stickCamera = (x: number, z: number) => {
      const target = orbit?.target
      if (!target) return
      camera.position.x += x - target.x
      camera.position.y += 0.9 - target.y
      camera.position.z += z - target.z
      target.set(x, 0.9, z)
    }

    if (typingInField()) {
      keys.current = {}
      stickCamera(pos.current.x, pos.current.z)
      onPose([pos.current.x, 0, pos.current.z], rotY.current)
      return
    }

    if (performance.now() < useAppStore.getState().hitStopUntil) {
      stickCamera(pos.current.x, pos.current.z)
      onPose([pos.current.x, 0, pos.current.z], rotY.current)
      return
    }

    if (player.seated && player.position) {
      stickCamera(player.position[0], player.position[2])
      onPose(player.position, player.rotationY)
      return
    }

    const frozen = mode === 'tag' && player.team === 'ghost' && Date.now() < hideUntilAt.current
    if (frozen) {
      stickCamera(pos.current.x, pos.current.z)
      onPose([pos.current.x, 0, pos.current.z], rotY.current)
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
      const look = (controls as { target?: THREE.Vector3 } | null)?.target
      if (look) forward.set(look.x - camera.position.x, 0, look.z - camera.position.z)
      else camera.getWorldDirection(forward).setY(0)
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1)
      forward.normalize()
      right.crossVectors(forward, up).normalize()

      const len = Math.hypot(fwd, strafe) || 1
      const held =
        player.weapon && (player.weaponUntil ?? 0) > Date.now() ? player.weapon : 'sword'
      const speedMul = WEAPON_STATS[held].speed
      const mx = ((right.x * strafe) / len + (forward.x * fwd) / len) * SPEED * speedMul * dt
      const mz = ((right.z * strafe) / len + (forward.z * fwd) / len) * SPEED * speedMul * dt

      const extra = useAppStore.getState().scene === 'kaykit' ? KAYKIT_EXTRA_AABBS : []
      const result = resolvePlayerMove(pos.current.x, pos.current.z, mx, mz, furnitureRef.current, undefined, extra)
      const movedX = result.x - pos.current.x
      const movedZ = result.z - pos.current.z
      pos.current.x = result.x
      pos.current.z = result.z
      if (movedX !== 0 || movedZ !== 0) {
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
      const extra = useAppStore.getState().scene === 'kaykit' ? KAYKIT_EXTRA_AABBS : []
      const result = resolvePlayerMove(
        pos.current.x,
        pos.current.z,
        dash.current.dx * step,
        dash.current.dz * step,
        furnitureRef.current,
        undefined,
        extra,
      )
      pos.current.x = result.x
      pos.current.z = result.z
      rotY.current = Math.atan2(dash.current.dx, dash.current.dz)
    }

    stickCamera(pos.current.x, pos.current.z)

    const pose: Vec3 = [pos.current.x, 0, pos.current.z]
    onPose(pose, rotY.current)

    const now = performance.now()
    const moving = fwd !== 0 || strafe !== 0 || dashing
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
