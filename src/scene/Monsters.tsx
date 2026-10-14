import { useRef } from 'react'
import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MonsterState } from '../../shared/combat'
import { isClassId } from '../../shared/classes'
import { useAppStore } from '../store'
import { KayKitHero } from './KayKitHero'

function MonsterView({ monster }: { monster: MonsterState }) {
  const ref = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(monster.x, 0, monster.z))
  const speed = useRef(0)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const nx = THREE.MathUtils.damp(pos.current.x, monster.x, 10, dt)
    const nz = THREE.MathUtils.damp(pos.current.z, monster.z, 10, dt)
    speed.current = Math.hypot(nx - pos.current.x, nz - pos.current.z) / Math.max(dt, 1 / 120)
    pos.current.x = nx
    pos.current.z = nz
    g.position.set(pos.current.x, 0, pos.current.z)
    g.rotation.y = monster.rotationY
  })

  if (!monster.alive) return null
  const ratio = Math.max(0, monster.hp / monster.maxHp)
  const classId = isClassId(monster.model) ? monster.model : 'knight'

  return (
    <group ref={ref}>
      <KayKitHero classId={classId} moving={speed.current > 0.35} running={speed.current > 3.2} attackAt={0} />
      <Billboard position={[0, 2.05, 0]}>
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
