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
        side: THREE.DoubleSide,
      }),
    [],
  )

  useFrame(() => {
    const current = useAppStore.getState().telegraph
    if (!current) return
    if (performance.now() > current.until) {
      useAppStore.getState().setTelegraph(null)
      return
    }
    const m = mesh.current
    if (!m) return
    const t = 1 - Math.max(0, current.until - performance.now()) / Math.max(1, current.ms)
    const inner = Math.max(0.02, current.r * (1 - t))
    m.geometry.dispose()
    m.geometry = new THREE.RingGeometry(inner, current.r, 48)
    const flash = current.until - performance.now() < 300
    mat.color.set(flash && Math.floor(performance.now() / 80) % 2 === 0 ? '#fff6e8' : '#d64545')
    mat.opacity = flash ? 0.62 : 0.36
  })

  if (!tel) return null
  return (
    <mesh ref={mesh} position={[tel.x, 0.06, tel.z]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <ringGeometry args={[tel.r * 0.92, tel.r, 48]} />
    </mesh>
  )
}
