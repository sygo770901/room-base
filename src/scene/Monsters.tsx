import { useMemo, useRef } from 'react'
import { Billboard, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MonsterState } from '../../shared/combat'
import { useAppStore } from '../store'

const URLS = {
  knight: '/assets/kaykit/characters/character_knight.gltf',
  barbarian: '/assets/kaykit/characters/character_barbarian.gltf',
  rogue: '/assets/kaykit/characters/character_rogue.gltf',
  mage: '/assets/kaykit/characters/character_mage.gltf',
} as const

for (const url of Object.values(URLS)) useGLTF.preload(url)

function MonsterModel({ model }: { model: keyof typeof URLS }) {
  const gltf = useGLTF(URLS[model])
  const obj = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return clone
  }, [gltf])
  return <primitive object={obj} />
}

function MonsterView({ monster }: { monster: MonsterState }) {
  const ref = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(monster.x, 0, monster.z))

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    pos.current.x = THREE.MathUtils.damp(pos.current.x, monster.x, 10, dt)
    pos.current.z = THREE.MathUtils.damp(pos.current.z, monster.z, 10, dt)
    g.position.set(pos.current.x, Math.sin(performance.now() * 0.004 + monster.x) * 0.03, pos.current.z)
    g.rotation.y = monster.rotationY
  })

  if (!monster.alive) return null
  const ratio = Math.max(0, monster.hp / monster.maxHp)

  return (
    <group ref={ref}>
      <MonsterModel model={monster.model} />
      <Billboard position={[0, 2.15, 0]}>
        <mesh position={[0, 0.16, 0]}>
          <planeGeometry args={[1.15, 0.1]} />
          <meshBasicMaterial color="#2a1414" />
        </mesh>
        <mesh position={[(ratio - 1) * 0.55, 0.16, 0.01]} scale={[ratio, 1, 1]}>
          <planeGeometry args={[1.1, 0.07]} />
          <meshBasicMaterial color={ratio < 0.35 ? '#ffb703' : '#d64545'} />
        </mesh>
      </Billboard>
    </group>
  )
}

export function Monsters() {
  const monsters = useAppStore((s) => s.monsters)
  return (
    <group>
      {monsters.map((m) => (
        <MonsterView key={m.id} monster={m} />
      ))}
    </group>
  )
}
