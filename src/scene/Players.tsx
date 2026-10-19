import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLAYER_CLASS } from '../../shared/classes'
import { useAppStore } from '../store'
import type { PlayerState } from '../types'
import { KayKitHero } from './KayKitHero'

export function Avatar({ player, isSelf }: { player: PlayerState; isSelf?: boolean }) {
  const prev = useRef(new THREE.Vector3(...player.position))
  const speed = useRef(0)
  const swingAt = useAppStore((s) => s.swings[player.id] ?? 0)

  useFrame((_, dt) => {
    const here = new THREE.Vector3(player.position[0], player.position[1], player.position[2])
    speed.current = here.distanceTo(prev.current) / Math.max(dt, 1 / 120)
    prev.current.copy(here)
  })

  const moving = !player.seated && speed.current > 0.28
  const labelY = player.hidden ? 1.15 : 1.95

  return (
    <group position={player.position} rotation={[0, player.rotationY, 0]}>
      <KayKitHero
        classId={PLAYER_CLASS}
        moving={moving}
        running={speed.current > 3.6}
        attackAt={swingAt}
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
