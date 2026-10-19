import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store'

export function SmokeClouds() {
  const smokes = useAppStore((s) => s.smokes)
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#c8cdd4',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    [],
  )

  useFrame(() => {
    const now = Date.now()
    const live = smokes.filter((c) => c.until > now)
    if (live.length !== smokes.length) useAppStore.getState().setSmokes(live)
  })

  const now = Date.now()
  return (
    <group>
      {smokes
        .filter((c) => c.until > now)
        .map((c) => (
          <mesh key={c.id} position={[c.x, 1.1, c.z]} material={mat}>
            <sphereGeometry args={[c.r, 12, 10]} />
          </mesh>
        ))}
    </group>
  )
}
