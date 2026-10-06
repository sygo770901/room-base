import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { emitFurniturePush, emitMove, emitSit } from '../net/socket'
import { resolvePlayerMove } from '../physics/collision'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPEED = 3.4
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
  const pos = useRef(new THREE.Vector3(...player.position))
  const rotY = useRef(player.rotationY)
  const lastSent = useRef(0)
  const lastPush = useRef(0)
  const seatedRef = useRef(player.seated)
  const furnitureRef = useRef(furniture)
  const joyRef = useRef(joy)
  const { camera, controls } = useThree()

  seatedRef.current = player.seated
  furnitureRef.current = furniture
  joyRef.current = joy

  useEffect(() => {
    if (!player.seated) return
    pos.current.set(...player.position)
    rotY.current = player.rotationY
  }, [player.seated, player.position[0], player.position[1], player.position[2], player.rotationY])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      keys.current[e.code] = true
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      if (e.code === 'KeyE' && seatedRef.current) void emitSit(null)
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, dt) => {
    const orbit = controls as { target?: THREE.Vector3 } | null

    if (player.seated) {
      orbit?.target?.set(player.position[0], 0.9, player.position[2])
      onPose(player.position, player.rotationY)
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

    if (fwd !== 0 || strafe !== 0) {
      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
      forward.normalize()
      right.crossVectors(forward, up).normalize()

      const len = Math.hypot(fwd, strafe) || 1
      const mx = ((right.x * strafe) / len + (forward.x * fwd) / len) * SPEED * dt
      const mz = ((right.z * strafe) / len + (forward.z * fwd) / len) * SPEED * dt

      const result = resolvePlayerMove(pos.current.x, pos.current.z, mx, mz, furnitureRef.current)
      const movedX = result.x - pos.current.x
      const movedZ = result.z - pos.current.z
      pos.current.x = result.x
      pos.current.z = result.z
      if (movedX !== 0 || movedZ !== 0) rotY.current = Math.atan2(movedX, movedZ)

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

    orbit?.target?.set(pos.current.x, 0.9, pos.current.z)

    const pose: Vec3 = [pos.current.x, 0, pos.current.z]
    onPose(pose, rotY.current)

    const now = performance.now()
    if (now - lastSent.current > 50 && (fwd !== 0 || strafe !== 0)) {
      lastSent.current = now
      emitMove(pose, rotY.current)
    }
  })

  return null
}
