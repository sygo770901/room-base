import { Suspense, useRef } from 'react'
import { Billboard, Html, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MonsterState } from '../../shared/combat'
import { isClassId } from '../../shared/classes'
import { useAppStore } from '../store'
import { DispenserPetMesh } from './DispenserPet'
import { DuckKingMesh, FallbackDuck } from './DuckKing'
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

  const now = Date.now()
  const deadFor = monster.alive ? 0 : monster.diedAt ? now - monster.diedAt : 4000
  if (!monster.alive && deadFor > 3000) return null
  const fade = monster.alive ? 1 : Math.max(0, 1 - deadFor / 3000)
  const sink = monster.alive ? 0 : Math.min(1.1, deadFor / 2800)
  const ratio = Math.max(0, monster.hp / monster.maxHp)
  const classId = isClassId(monster.model) ? monster.model : 'knight'
  const moving = monster.alive && speed.current > 0.35
  const barY = monster.kind === 'dispenser' ? 2.05 : monster.kind === 'duck-king' ? 2.15 : 2.05

  return (
    <group ref={ref} position={[0, -sink, 0]} scale={0.85 + fade * 0.15}>
      {monster.kind === 'duck-king' ? (
        <group scale={monster.phase === 2 ? 1.18 * 1.15 : 1.18}>
          <Suspense fallback={<FallbackDuck moving={moving} fleeing={moving && speed.current > 2.8} raging={monster.phase === 2} downed={!monster.alive} />}>
            <DuckKingMesh moving={moving} fleeing={moving && speed.current > 2.8} raging={monster.phase === 2} downed={!monster.alive} />
          </Suspense>
          <DuckSpeechBubble />
        </group>
      ) : monster.kind === 'dispenser' ? (
        <group scale={1.55} rotation-x={!monster.alive ? 1.2 : 0}>
          <DispenserPetMesh pouncing={monster.pouncing} lit={monster.id === 'dispenser'} />
        </group>
      ) : (
        <KayKitHero classId={classId === 'ranger' ? 'knight' : classId} moving={moving} running={speed.current > 3.2} attackAt={0} downed={!monster.alive} />
      )}
      {monster.casting && (
        <mesh position={[0, 1.25, 0]}>
          <sphereGeometry args={[0.58, 12, 10]} />
          <meshBasicMaterial color="#c8f4ff" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
      <Billboard position={[0, barY, 0]}>
        {(monster.kind === 'duck-king' || monster.kind === 'dispenser') && (
          <Text fontSize={0.2} color="#f4f1ec" anchorX="center" anchorY="bottom" outlineWidth={0.012} outlineColor="#000">
            {monster.name}
          </Text>
        )}
        <mesh position={[0, 0.16, 0]}>
          <planeGeometry args={[1.15, 0.1]} />
          <meshBasicMaterial color="#2a1414" />
        </mesh>
        <mesh position={[(ratio - 1) * 0.55, 0.16, 0.01]} scale={[ratio, 1, 1]}>
          <planeGeometry args={[1.1, 0.07]} />
          <meshBasicMaterial color={ratio < 0.35 ? '#ffb703' : monster.kind === 'duck-king' ? '#c9a0ff' : '#d64545'} />
        </mesh>
      </Billboard>
    </group>
  )
}

function DuckSpeechBubble() {
  const speech = useAppStore((s) => s.duckSpeech)
  if (!speech || speech.until <= Date.now()) return null
  return (
    <Html position={[0, 2.55, 0]} center sprite distanceFactor={7} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
      <div className={speech.shout ? 'duck-bubble shout' : 'duck-bubble'}>{speech.text}</div>
    </Html>
  )
}

export function Monsters() {
  const monsters = useAppStore((s) => s.monsters)
  const scene = useAppStore((s) => s.scene)
  if (scene === 'sample') return null
  return (
    <group>
      {monsters.map((m) => (
        <MonsterView key={m.id} monster={m} />
      ))}
    </group>
  )
}
