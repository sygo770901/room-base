import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLAYER_CLASS } from '../../shared/classes'
import { useAppStore } from '../store'
import type { PlayerState } from '../types'
import { KayKitHero } from './KayKitHero'
import { ModelBoundary } from './ModelBoundary'

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

export function Avatar({ player, isSelf }: { player: PlayerState; isSelf?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const ready = useRef(false)
  const swingAt = useAppStore((s) => s.swings[player.id] ?? 0)
  const combo = useAppStore((s) => s.swingCombo[player.id] ?? 0)
  const hit = useAppStore((s) => s.hitAnim[player.id])
  const storedJump = useAppStore((s) => s.jumpPhase[player.id] ?? null)
  const y = player.position?.[1] ?? 0
  const jumpPhase = storedJump ?? (y > 0.4 ? 'idle' : y > 0.12 ? 'start' : null)
  const dashUntil = useAppStore((s) => s.dashUntil[player.id] ?? 0)
  const hurtUntil = useAppStore((s) => s.hurtFlashUntil[player.id] ?? 0)
  const throwAt = useAppStore((s) => s.throwAt[player.id] ?? 0)
  const poopMarked = useAppStore((s) => s.smokes.some((c) => c.hits?.includes(player.id) && (!c.landAt || Date.now() < c.landAt + 3000)))

  useFrame((_, dt) => {
    const g = group.current
    const p = player.position
    if (!g || !p) return
    if (hurtUntil > Date.now()) {
      g.visible = Math.floor(Date.now() / 80) % 2 === 0
    } else if (!g.visible) {
      g.visible = true
    }
    const py = p[1] ?? 0
    if (isSelf || !ready.current) {
      g.position.set(p[0], py, p[2])
      g.rotation.y = player.rotationY
      ready.current = true
      speed.current = 0
      return
    }
    const dist = Math.hypot(p[0] - g.position.x, p[2] - g.position.z)
    if (dist > 8) {
      g.position.set(p[0], py, p[2])
      g.rotation.y = player.rotationY
      speed.current = 0
      return
    }
    const nx = THREE.MathUtils.damp(g.position.x, p[0], 14, dt)
    const ny = THREE.MathUtils.damp(g.position.y, py, 18, dt)
    const nz = THREE.MathUtils.damp(g.position.z, p[2], 14, dt)
    speed.current = Math.hypot(nx - g.position.x, nz - g.position.z) / Math.max(dt, 1 / 120)
    g.position.x = nx
    g.position.y = ny
    g.position.z = nz
    g.rotation.y = dampAngle(g.rotation.y, player.rotationY, 16, dt)
  })

  const moving = !player.seated && speed.current > 0.28
  const labelY = player.hidden ? 1.15 : 1.95
  const whiteFlash = hurtUntil > Date.now() && hurtUntil - Date.now() > 500

  return (
    <group ref={group}>
      {player.away && (
        <mesh position={[0, 0.95, 0]}>
          <capsuleGeometry args={[0.48, 1.15, 4, 8]} />
          <meshBasicMaterial color="#8aa0c8" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      )}
      {whiteFlash && (
        <mesh position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.55, 10, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.34, 0.5, 22]} />
        <meshBasicMaterial color={player.color} transparent opacity={0.82} depthWrite={false} />
      </mesh>
      {poopMarked && (
        <mesh position={[0, 2.05, 0]}>
          <sphereGeometry args={[0.08, 6, 5]} />
          <meshBasicMaterial color="#7d9a4a" transparent opacity={0.55} />
        </mesh>
      )}
      <KayKitHero
        classId={PLAYER_CLASS}
        moving={moving}
        running={speed.current > 3.6}
        dashUntil={dashUntil}
        attackAt={swingAt}
        combo={combo}
        hitAt={hit?.at ?? 0}
        hitKind={hit?.kind}
        jumpPhase={jumpPhase}
        heldWeapon={
          player.weapon && (player.weaponUntil ?? 0) > Date.now() ? player.weapon : 'sword'
        }
        seated={Boolean(player.seated)}
        hidden={player.hidden}
        throwAt={throwAt}
        downed={Boolean(player.downedUntil && player.downedUntil > Date.now()) || player.hp <= 0}
      />
      {player.phrase && player.phrase.until > Date.now() && (
        <Billboard position={[0, labelY + 0.32, 0]}>
          <Text
            fontSize={0.2}
            color="#fff4d6"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#1a1208"
          >
            {player.phrase.text}
          </Text>
        </Billboard>
      )}
      {!isSelf && (
        <Billboard position={[0, labelY, 0]}>
          <Text
            fontSize={0.16}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#000000"
          >
            {player.away ? '斷線中' : player.downedUntil && player.downedUntil > Date.now() ? `${player.name} · 倒地` : player.name}
            {player.away ? '' : player.role === 'host' ? ' · 房主' : ''}
            {player.hidden && !player.away ? ' · 躲藏' : ''}
          </Text>
        </Billboard>
      )}
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
        .filter((p) => p.id !== selfId && p.position)
        .map((p) => (
          <Avatar key={p.id} player={p} />
        ))}
    </>
  )
}

export function LocalAvatar({ player }: { player: PlayerState }) {
  return (
    <ModelBoundary file="/assets/kaykit/adventurers/Ranger.glb" fallback={null}>
      <Avatar player={player} isSelf />
    </ModelBoundary>
  )
}
