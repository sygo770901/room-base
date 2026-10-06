import { Text, Billboard } from '@react-three/drei'
import type { PlayerState } from '../types'

export function Avatar({ player, isSelf }: { player: PlayerState; isSelf?: boolean }) {
  const bodyColor = player.color
  return (
    <group position={player.position} rotation={[0, player.rotationY, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.55, 6, 12]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f0e6d8" />
      </mesh>
      {/* face direction */}
      <mesh position={[0, 1.15, 0.16]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <Billboard position={[0, 1.55, 0]}>
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
