import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store'

export function Telegraph() {
  const tel = useAppStore((s) => s.telegraph)
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#d64545',
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    [],
  )

  useFrame(() => {
    const m = mesh.current
    if (!m || !tel) return
    const t = 1 - Math.max(0, tel.until - performance.now()) / Math.max(1, tel.ms)
    const inner = Math.max(0.08, tel.r * t)
    m.scale.set(inner / tel.r, 1, inner / tel.r)
    const flash = tel.until - performance.now() < 300
    mat.color.set(flash && Math.floor(performance.now() / 80) % 2 === 0 ? '#fff6e8' : '#d64545')
    mat.opacity = flash ? 0.62 : 0.36
  })

  if (!tel || performance.now() > tel.until) return null
  return (
    <mesh ref={mesh} position={[tel.x, 0.06, tel.z]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <circleGeometry args={[tel.r, 48]} />
    </mesh>
  )
}
