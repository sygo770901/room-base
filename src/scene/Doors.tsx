import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DOOR_ANIM_MS, DOOR_THICK, DOOR_WIDTH } from '../../shared/doors'
import { doorsOf } from '../../shared/mapData'
import { useAppStore } from '../store'

function DoorLeaf({
  x,
  z,
  rotY,
  open,
  busyUntil,
}: {
  x: number
  z: number
  rotY: number
  open: boolean
  busyUntil: number
}) {
  const ref = useRef<THREE.Group>(null)
  const angle = useRef(open ? -Math.PI / 2 : 0)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const left = Math.max(0, busyUntil - Date.now())
    const t = left > 0 ? 1 - left / DOOR_ANIM_MS : 1
    const target = open ? -Math.PI / 2 : 0
    const from = open ? 0 : -Math.PI / 2
    const want = left > 0 ? from + (target - from) * t : target
    angle.current = THREE.MathUtils.damp(angle.current, want, 14, dt)
    g.rotation.y = rotY + angle.current
  })

  const hinge = useMemo(() => {
    const alongX = Math.abs(Math.cos(rotY)) > 0.5
    const ox = alongX ? -DOOR_WIDTH / 2 : 0
    const oz = alongX ? 0 : -DOOR_WIDTH / 2
    return { ox, oz }
  }, [rotY])

  return (
    <group position={[x + hinge.ox, 0, z + hinge.oz]}>
      <group ref={ref}>
        <mesh position={[-hinge.ox, 1.35, -hinge.oz]} castShadow>
          <boxGeometry args={[Math.abs(Math.cos(rotY)) > 0.5 ? DOOR_WIDTH : DOOR_THICK, 2.7, Math.abs(Math.cos(rotY)) > 0.5 ? DOOR_THICK : DOOR_WIDTH]} />
          <meshStandardMaterial color="#6b4423" roughness={0.72} metalness={0.05} />
        </mesh>
      </group>
    </group>
  )
}

export function Doors() {
  const doors = useAppStore((s) => s.doors)
  const scene = useAppStore((s) => s.scene)
  const defs = doorsOf(scene)
  const byId = useMemo(() => Object.fromEntries(doors.map((d) => [d.id, d])), [doors])
  return (
    <group>
      {defs.map((def) => {
        const st = byId[def.id]
        return (
          <DoorLeaf
            key={def.id}
            x={def.x}
            z={def.z}
            rotY={def.rotY}
            open={Boolean(st?.open)}
            busyUntil={st?.busyUntil ?? 0}
          />
        )
      })}
    </group>
  )
}
