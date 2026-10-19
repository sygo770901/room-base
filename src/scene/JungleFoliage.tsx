import { JUNGLE_TREE_SPOTS } from '../../shared/mapData'
import { JUNGLE_ROCKS } from '../../shared/platforms'

function Tree({ x, z, r }: { x: number; z: number; r: number }) {
  const h = 3.4 + (Math.abs(Math.round(x * 3 + z)) % 5) * 0.22
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h * 0.28, 0]} castShadow>
        <cylinderGeometry args={[r * 0.55, r * 0.7, h * 0.55, 6]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.86} />
      </mesh>
      <mesh position={[0, h * 0.72, 0]} castShadow>
        <icosahedronGeometry args={[1.15 + r, 0]} />
        <meshStandardMaterial color="#3f7a3a" roughness={0.78} />
      </mesh>
    </group>
  )
}

function Rock({ minX, maxX, minZ, maxZ, topY }: { minX: number; maxX: number; minZ: number; maxZ: number; topY: number }) {
  const x = (minX + maxX) / 2
  const z = (minZ + maxZ) / 2
  return (
    <mesh position={[x, topY / 2, z]} castShadow>
      <boxGeometry args={[maxX - minX, topY, maxZ - minZ]} />
      <meshStandardMaterial color="#6b6a62" roughness={0.92} />
    </mesh>
  )
}

export function JungleFoliage() {
  return (
    <group>
      {JUNGLE_TREE_SPOTS.map((t) => (
        <Tree key={`${t.x}-${t.z}`} x={t.x} z={t.z} r={t.r} />
      ))}
      {JUNGLE_ROCKS.map((r) => (
        <Rock key={`${r.minX}-${r.minZ}`} {...r} />
      ))}
    </group>
  )
}
