import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store'

function Ring({
  x,
  z,
  r,
  ms,
  until,
}: {
  x: number
  z: number
  r: number
  ms: number
  until: number
}) {
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
    if (performance.now() > until) return
    const m = mesh.current
    if (!m) return
    const t = 1 - Math.max(0, until - performance.now()) / Math.max(1, ms)
    const inner = Math.max(0.02, r * (1 - t))
    m.geometry.dispose()
    m.geometry = new THREE.RingGeometry(inner, r, 48)
    const flash = until - performance.now() < 300
    mat.color.set(flash && Math.floor(performance.now() / 80) % 2 === 0 ? '#fff6e8' : '#d64545')
    mat.opacity = flash ? 0.62 : 0.36
  })

  return (
    <mesh ref={mesh} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <ringGeometry args={[r * 0.92, r, 48]} />
    </mesh>
  )
}

export function Telegraph() {
  const boss = useAppStore((s) => s.telegraph)
  const extras = useAppStore((s) => s.telegraphs)

  useFrame(() => {
    const current = useAppStore.getState().telegraph
    if (current && performance.now() > current.until) useAppStore.getState().setTelegraph(null)
  })

  const now = performance.now()
  const rings = extras.filter((t) => now < t.until)
  const showBoss = boss && now < boss.until && !rings.some((t) => t.id === 'boss')

  return (
    <group>
      {showBoss && boss && (
        <Ring x={boss.x} z={boss.z} r={boss.r} ms={boss.ms} until={boss.until} />
      )}
      {rings.map((t) => (
        <Ring key={t.id} x={t.x} z={t.z} r={t.r} ms={t.ms} until={t.until} />
      ))}
    </group>
  )
}
