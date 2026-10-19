import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLAYER_CLASS } from '../../shared/classes'
import { useAppStore } from '../store'
import type { PlayerState } from '../types'
import { KayKitHero } from './KayKitHero'

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
  const jumpPhase = useAppStore((s) => s.jumpPhase[player.id] ?? null)
  const dashUntil = useAppStore((s) => s.dashUntil[player.id] ?? 0)
  const hurtUntil = useAppStore((s) => s.hurtFlashUntil[player.id] ?? 0)

  useFrame((_, dt) => {
    const g = group.current
    const p = player.position
    if (!g || !p) return
    if (hurtUntil > Date.now()) {
      g.visible = Math.floor(Date.now() / 80) % 2 === 0
    } else if (!g.visible) {
      g.visible = true
    }
    if (isSelf || !ready.current) {
      g.position.set(p[0], 0, p[2])
      g.rotation.y = player.rotationY
      ready.current = true
      speed.current = 0
      return
    }
    const dist = Math.hypot(p[0] - g.position.x, p[2] - g.position.z)
    if (dist > 8) {
      g.position.set(p[0], 0, p[2])
      g.rotation.y = player.rotationY
      speed.current = 0
      return
    }
    const nx = THREE.MathUtils.damp(g.position.x, p[0], 14, dt)
    const nz = THREE.MathUtils.damp(g.position.z, p[2], 14, dt)
    speed.current = Math.hypot(nx - g.position.x, nz - g.position.z) / Math.max(dt, 1 / 120)
    g.position.x = nx
    g.position.z = nz
    g.rotation.y = dampAngle(g.rotation.y, player.rotationY, 16, dt)
  })

  const moving = !player.seated && speed.current > 0.28
  const labelY = player.hidden ? 1.15 : 1.95

  return (
    <group ref={group}>
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
        compact
      />
      <Billboard position={[0, labelY, 0]}>
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
        .filter((p) => p.id !== selfId && p.position)
        .map((p) => (
          <Avatar key={p.id} player={p} />
        ))}
    </>
  )
}

export function LocalAvatar({ player }: { player: PlayerState }) {
  return <Avatar player={player} isSelf />
}
