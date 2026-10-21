import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DOOR_ANIM_MS, DOOR_THICK, doorHingeLocalX, doorLeafWidth } from '../../shared/doors'
import { doorsOf } from '../../shared/mapData'
import { useAppStore } from '../store'

function DoorLeaf({
  x,
  z,
  rotY,
  open,
  busyUntil,
  width,
}: {
  x: number
  z: number
  rotY: number
  open: boolean
  busyUntil: number
  width: number
}) {
  const ref = useRef<THREE.Group>(null)
  const angle = useRef(open ? -Math.PI / 2 : 0)
  const hingeX = doorHingeLocalX(width)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const left = Math.max(0, busyUntil - Date.now())
    const t = left > 0 ? 1 - left / DOOR_ANIM_MS : 1
    const target = open ? -Math.PI / 2 : 0
    const from = open ? 0 : -Math.PI / 2
    const want = left > 0 ? from + (target - from) * t : target
    angle.current = THREE.MathUtils.damp(angle.current, want, 14, dt)
    g.rotation.y = angle.current
  })

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <group position={[hingeX, 0, 0]}>
        <group ref={ref}>
          <mesh position={[width / 2, 1.35, 0]} castShadow>
            <boxGeometry args={[width, 2.7, DOOR_THICK]} />
            <meshStandardMaterial color="#6b4423" roughness={0.72} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function Doors() {
  const doors = useAppStore((s) => s.doors)
  const scene = useAppStore((s) => s.scene)
  const defs = doorsOf(scene)
  const width = doorLeafWidth(scene)
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
            width={width}
          />
        )
      })}
    </group>
  )
}
