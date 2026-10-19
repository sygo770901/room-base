import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ProjectileState } from '../../shared/combat'
import { useAppStore } from '../store'

function Orb({ orb }: { orb: ProjectileState }) {
  const ref = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(orb.x, 1.15, orb.z))

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    pos.current.x = THREE.MathUtils.damp(pos.current.x, orb.x, 12, dt)
    pos.current.z = THREE.MathUtils.damp(pos.current.z, orb.z, 12, dt)
    g.position.copy(pos.current)
  })

  return (
    <group ref={ref} position={[orb.x, 1.15, orb.z]}>
      <mesh>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshBasicMaterial color="#e8fbff" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshBasicMaterial color="#7ad7ff" transparent opacity={0.32} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Projectiles() {
  const projectiles = useAppStore((s) => s.projectiles)
  if (!projectiles.length) return null
  return (
    <group>
      {projectiles.map((orb) => (
        <Orb key={orb.id} orb={orb} />
      ))}
    </group>
  )
}
