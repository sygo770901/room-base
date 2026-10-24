import { useRef } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { groundY } from '../../shared/heightfield'
import { heightFieldOf } from '../../shared/heightmaps'
import { SMOKE_RADIUS, poopArcPoints } from '../../shared/smoke'
import { useAppStore } from '../store'

export function PoopAim() {
  const aim = useAppStore((s) => s.poopAim)
  const selfId = useAppStore((s) => s.selfId)
  const pos = useAppStore((s) => (selfId ? s.players[selfId]?.position : undefined))
  const scene = useAppStore((s) => s.scene)
  if (!aim || !pos) return null
  const field = heightFieldOf(scene)
  const y0 = field ? (groundY(field, pos[0], pos[2]) ?? pos[1] ?? 0) : (pos[1] ?? 0)
  const y1 = field ? (groundY(field, aim.x, aim.z) ?? 0) : 0
  const points = poopArcPoints(pos[0], pos[2], y0 + 0.2, aim.x, aim.z, y1).map(
    (p) => [p.x, p.y, p.z] as [number, number, number],
  )
  return (
    <group>
      <Line points={points} color="#d6ee6a" dashed dashSize={0.42} gapSize={0.26} lineWidth={2} />
      <mesh rotation-x={-Math.PI / 2} position={[aim.x, y1 + 0.05, aim.z]}>
        <ringGeometry args={[Math.max(0.2, SMOKE_RADIUS - 0.15), SMOKE_RADIUS, 48]} />
        <meshBasicMaterial color="#c6e25a" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function StuckMark({ id }: { id: string }) {
  const smokes = useAppStore((s) => s.smokes)
  const mesh = useRef<THREE.Mesh>(null)
  const icon = useRef<HTMLDivElement>(null)
  useFrame(() => {
    const now = Date.now()
    const on = smokes.some((c) => c.sticks?.some((s) => s.id === id && s.until > now))
    if (mesh.current) mesh.current.visible = on
    if (icon.current) icon.current.style.display = on ? 'block' : 'none'
  })
  return (
    <group>
      <mesh ref={mesh} position={[0, 1.05, 0]} visible={false}>
        <sphereGeometry args={[0.72, 12, 8]} />
        <meshBasicMaterial color="#c6e25a" transparent opacity={0.38} depthWrite={false} />
      </mesh>
      <Html position={[0, 2.3, 0]} center sprite distanceFactor={8} style={{ pointerEvents: 'none' }} zIndexRange={[12, 0]}>
        <div ref={icon} className="stuck-icon" style={{ display: 'none' }}>
          💩
        </div>
      </Html>
    </group>
  )
}
