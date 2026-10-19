import { useMemo, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BARREL_SHARD_MS } from '../../shared/barrels'
import { useAppStore } from '../store'

const BARREL_URL = '/assets/kaykit/barrel.gltf.glb'
useGLTF.preload(BARREL_URL)

type Shard = { x: number; y: number; z: number; vx: number; vz: number; spin: number; until: number }
const SHARDS: Shard[] = []

export function spawnBarrelShards(x: number, z: number) {
  const n = 4 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.3
    SHARDS.push({
      x,
      y: 0.4,
      z,
      vx: Math.cos(a) * (1.8 + Math.random()),
      vz: Math.sin(a) * (1.8 + Math.random()),
      spin: Math.random() * 4,
      until: Date.now() + BARREL_SHARD_MS,
    })
  }
}

export function Barrels() {
  const barrels = useAppStore((s) => s.barrels)
  const drops = useAppStore((s) => s.drops)
  const gltf = useGLTF(BARREL_URL)
  const [, bump] = useState(0)
  const glow = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffe566', transparent: true, opacity: 0.9 }),
    [],
  )

  useFrame((_, dt) => {
    const now = Date.now()
    let dirty = false
    for (let i = SHARDS.length - 1; i >= 0; i--) {
      const s = SHARDS[i]
      if (s.until <= now) {
        SHARDS.splice(i, 1)
        dirty = true
        continue
      }
      s.x += s.vx * dt
      s.z += s.vz * dt
      s.y = Math.max(0.08, s.y - dt * 1.2)
      s.spin += dt * 8
      dirty = true
    }
    if (dirty) bump((n) => n + 1)
  })

  return (
    <group>
      {barrels
        .filter((b) => b.alive)
        .map((b) => (
          <primitive key={b.id} object={gltf.scene.clone()} position={[b.x, 0, b.z]} scale={1.15} />
        ))}
      {drops.map((d) => {
        const t = (Date.now() % 1600) / 1600
        const y = 0.42 + Math.sin(t * Math.PI * 2) * 0.12
        return (
          <group key={d.id} position={[d.x, y, d.z]} rotation={[0, t * Math.PI * 2, 0]}>
            <mesh>
              <octahedronGeometry args={[0.2, 0]} />
              <primitive object={glow} attach="material" />
            </mesh>
          </group>
        )
      })}
      {SHARDS.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} rotation={[s.spin, s.spin * 0.4, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.08]} />
          <meshStandardMaterial color="#8a5a32" />
        </mesh>
      ))}
    </group>
  )
}
