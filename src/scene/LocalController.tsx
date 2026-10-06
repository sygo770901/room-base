import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { emitMove, emitSit } from '../net/socket'
import { resolveMove } from '../physics/collision'
import { useAppStore } from '../store'
import type { PlayerState, Vec3 } from '../types'

const SPEED = 2.6

export function LocalController({
  player,
  onPose,
}: {
  player: PlayerState
  onPose: (position: Vec3, rotationY: number) => void
}) {
  const furniture = useAppStore((s) => s.furniture)
  const keys = useRef<Record<string, boolean>>({})
  const pos = useRef(new THREE.Vector3(...player.position))
  const rotY = useRef(player.rotationY)
  const lastSent = useRef(0)
  const seatedRef = useRef(player.seated)
  const furnitureRef = useRef(furniture)
  const { camera } = useThree()

  seatedRef.current = player.seated
  furnitureRef.current = furniture

  useEffect(() => {
    pos.current.set(...player.position)
    rotY.current = player.rotationY
  }, [player.seated, player.position[0], player.position[1], player.position[2], player.rotationY])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }
      if (e.code === 'KeyE' && seatedRef.current) {
        void emitSit(null)
      }
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
    if (player.seated) {
      camera.position.lerp(
        new THREE.Vector3(player.position[0] + 2.6, 3.6, player.position[2] + 3.2),
        0.1,
      )
      camera.lookAt(player.position[0], 0.7, player.position[2] - 0.3)
      onPose(player.position, player.rotationY)
      return
    }

    const forward = (keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) - (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0)
    const strafe = (keys.current.KeyD || keys.current.ArrowRight ? 1 : 0) - (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0)

    if (forward !== 0 || strafe !== 0) {
      const move = new THREE.Vector3(strafe, 0, -forward).normalize().multiplyScalar(SPEED * dt)
      const next = resolveMove(pos.current.x, pos.current.z, move.x, move.z, furnitureRef.current)
      const movedX = next.x - pos.current.x
      const movedZ = next.z - pos.current.z
      pos.current.x = next.x
      pos.current.z = next.z
      if (movedX !== 0 || movedZ !== 0) {
        rotY.current = Math.atan2(movedX, movedZ)
      }
    }

    const targetCam = new THREE.Vector3(pos.current.x + 2.8, 4.0, pos.current.z + 3.4)
    camera.position.lerp(targetCam, 0.1)
    camera.lookAt(pos.current.x, 0.7, pos.current.z)

    const pose: Vec3 = [pos.current.x, 0, pos.current.z]
    onPose(pose, rotY.current)

    const now = performance.now()
    if (now - lastSent.current > 50) {
      lastSent.current = now
      emitMove(pose, rotY.current)
    }
  })

  return null
}
