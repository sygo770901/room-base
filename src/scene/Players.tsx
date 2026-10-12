import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '../store'
import type { PlayerState } from '../types'

const SKIN = '#f0c9a8'
const HAIR = ['#3a2a22', '#1c1c1c', '#6b3a22', '#c4a574', '#2c3e50']
const PANTS = '#2c3340'
const SHOE = '#1a1c1e'

function hairColor(id: string) {
  let n = 0
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % HAIR.length
  return HAIR[n]
}

function Limb({
  args,
  position,
  color,
  radius = 0.055,
}: {
  args: [number, number]
  position: [number, number, number]
  color: string
  radius?: number
}) {
  return (
    <mesh position={position} castShadow>
      <capsuleGeometry args={[radius, args[1], 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.65} />
    </mesh>
  )
}

export function Avatar({ player, isSelf }: { player: PlayerState; isSelf?: boolean }) {
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)
  const prev = useRef(new THREE.Vector3(...player.position))
  const phase = useRef(0)
  const swing = useRef(0)
  const seated = player.seated
  const swingAt = useAppStore((s) => s.swings[player.id] ?? 0)
  const swingRef = useRef(0)
  if (swingAt > swingRef.current) swingRef.current = swingAt

  useFrame((_, dt) => {
    const here = new THREE.Vector3(player.position[0], player.position[1], player.position[2])
    const speed = here.distanceTo(prev.current) / Math.max(dt, 1 / 120)
    prev.current.copy(here)

    const target = !seated && speed > 0.25 ? Math.min(0.7, speed * 0.18) : 0
    swing.current = THREE.MathUtils.damp(swing.current, target, 8, dt)
    if (swing.current > 0.05) phase.current += dt * (7 + speed)

    const s = Math.sin(phase.current) * swing.current
    if (seated) {
      if (legL.current) legL.current.rotation.x = -1.15
      if (legR.current) legR.current.rotation.x = -1.15
      if (kneeL.current) kneeL.current.rotation.x = 1.35
      if (kneeR.current) kneeR.current.rotation.x = 1.35
      if (armL.current) armL.current.rotation.x = -0.35
      if (armR.current) armR.current.rotation.x = -0.35
      if (elbowL.current) elbowL.current.rotation.x = -0.8
      if (elbowR.current) elbowR.current.rotation.x = -0.8
      return
    }

    if (legL.current) legL.current.rotation.x = s
    if (legR.current) legR.current.rotation.x = -s
    if (armL.current) armL.current.rotation.x = -s * 0.9
    if (armR.current) armR.current.rotation.x = s * 0.9
    const bend = Math.max(0, -Math.sin(phase.current)) * swing.current * 1.1
    const bendOpp = Math.max(0, Math.sin(phase.current)) * swing.current * 1.1
    if (kneeL.current) kneeL.current.rotation.x = bend
    if (kneeR.current) kneeR.current.rotation.x = bendOpp
    if (elbowL.current) elbowL.current.rotation.x = -0.15 - bendOpp * 0.4
    if (elbowR.current) elbowR.current.rotation.x = -0.15 - bend * 0.4

    const age = (performance.now() - swingRef.current) / 1000
    if (age >= 0 && age < 0.42) {
      const k = Math.sin((age / 0.42) * Math.PI)
      if (armR.current) {
        armR.current.rotation.x = -2.2 * k
        armR.current.rotation.z = 0.45 * k
      }
      if (elbowR.current) elbowR.current.rotation.x = -1.25 * k
    }
  })

  const shirt = player.color
  const hair = hairColor(player.id)

  return (
    <group position={player.position} rotation={[0, player.rotationY, 0]}>
      <group scale={[1, player.hidden ? 0.58 : 1, 1]}>
      {/* 左腿：大腿樞紐在髖 */}
      <group ref={legL} position={[-0.1, 0.86, 0]}>
        <Limb args={[0.07, 0.28]} position={[0, -0.2, 0]} color={PANTS} radius={0.065} />
        <group ref={kneeL} position={[0, -0.4, 0]}>
          <Limb args={[0.06, 0.26]} position={[0, -0.18, 0]} color={PANTS} radius={0.055} />
          <mesh position={[0, -0.36, 0.05]} castShadow>
            <boxGeometry args={[0.1, 0.06, 0.2]} />
            <meshStandardMaterial color={SHOE} roughness={0.5} />
          </mesh>
        </group>
      </group>

      <group ref={legR} position={[0.1, 0.86, 0]}>
        <Limb args={[0.07, 0.28]} position={[0, -0.2, 0]} color={PANTS} radius={0.065} />
        <group ref={kneeR} position={[0, -0.4, 0]}>
          <Limb args={[0.06, 0.26]} position={[0, -0.18, 0]} color={PANTS} radius={0.055} />
          <mesh position={[0, -0.36, 0.05]} castShadow>
            <boxGeometry args={[0.1, 0.06, 0.2]} />
            <meshStandardMaterial color={SHOE} roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* 髖與軀幹 */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.32, 0.16, 0.18]} />
        <meshStandardMaterial color={PANTS} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.16, 0]} castShadow>
        <boxGeometry args={[0.36, 0.38, 0.2]} />
        <meshStandardMaterial color={shirt} roughness={0.6} />
      </mesh>

      {/* 左臂 */}
      <group ref={armL} position={[-0.24, 1.3, 0]}>
        <Limb args={[0.05, 0.2]} position={[0, -0.14, 0]} color={shirt} radius={0.045} />
        <group ref={elbowL} position={[0, -0.28, 0]}>
          <Limb args={[0.045, 0.18]} position={[0, -0.12, 0]} color={SKIN} radius={0.04} />
          <mesh position={[0, -0.26, 0]} castShadow>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
        </group>
      </group>
      <group ref={armR} position={[0.24, 1.3, 0]}>
        <Limb args={[0.05, 0.2]} position={[0, -0.14, 0]} color={shirt} radius={0.045} />
        <group ref={elbowR} position={[0, -0.28, 0]}>
          <Limb args={[0.045, 0.18]} position={[0, -0.12, 0]} color={SKIN} radius={0.04} />
          <mesh position={[0, -0.26, 0]} castShadow>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.46, 0.04]} rotation={[0.35, 0, 0]} castShadow>
            <boxGeometry args={[0.05, 0.52, 0.08]} />
            <meshStandardMaterial color="#ece7dc" metalness={0.62} roughness={0.28} />
          </mesh>
        </group>
      </group>

      {/* 頸與頭，臉朝 +Z（角色前進方向） */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.08, 8]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      <mesh position={[0, 1.56, 0]} castShadow>
        <sphereGeometry args={[0.16, 20, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.64, -0.01]} castShadow>
        <sphereGeometry args={[0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={hair} roughness={0.8} />
      </mesh>
      <mesh position={[-0.055, 1.58, 0.13]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.055, 1.58, 0.13]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 1.53, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.012, 0.03, 3, 6]} />
        <meshStandardMaterial color="#e0b090" />
      </mesh>
      </group>

      <Billboard position={[0, player.hidden ? 1.25 : 1.9, 0]}>
        <Text
          fontSize={0.16}
          color={isSelf ? '#f2cc8f' : '#ffffff'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {player.name}
          {player.role === 'host' ? ' · 房主' : ''}
          {player.hidden ? ' · 躲藏' : ''}
        </Text>
      </Billboard>
    </group>
  )
}

export function RemotePlayers({
  players,
  selfId,
}: {
  players: Record<string, PlayerState>
  selfId: string | null
}) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <Avatar key={p.id} player={p} />
        ))}
    </>
  )
}

export function LocalAvatar({ player }: { player: PlayerState }) {
  return <Avatar player={player} isSelf />
}
