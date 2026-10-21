import { FLOOR_PLACES, WALL_PLACES } from '../../shared/dungeon'
import { extraWallsOf } from '../../shared/mapData'
import { SAMPLE_PLACES } from '../../shared/sampleRoom'
import { useAppStore } from '../store'

/** 模型載入失敗時的方塊地城，避免整片黑。 */
export function FallbackDungeon() {
  const scene = useAppStore((s) => s.scene)
  const extras = extraWallsOf(scene)
  if (scene === 'sample') {
    return (
      <group>
        {SAMPLE_PLACES.filter((p) => p.model.startsWith('floor_')).map((p, i) => (
          <mesh key={`sf-${i}`} position={[p.x, p.y, p.z]} receiveShadow>
            <boxGeometry args={[4, 0.1, 4]} />
            <meshStandardMaterial color="#6a5a4c" />
          </mesh>
        ))}
        {SAMPLE_PLACES.filter((p) => p.model.startsWith('wall')).map((p, i) => (
          <mesh key={`sw-${i}`} position={[p.x, p.y + 2, p.z]} rotation={[0, p.rotY, 0]}>
            <boxGeometry args={[4, 4, 1]} />
            <meshStandardMaterial color="#4a3f38" />
          </mesh>
        ))}
      </group>
    )
  }
  return (
    <group>
      {FLOOR_PLACES.map((p, i) => (
        <mesh key={`f-${i}`} position={[p.x, -0.05, p.z]} receiveShadow>
          <boxGeometry args={[4, 0.1, 4]} />
          <meshStandardMaterial color="#6a5a4c" />
        </mesh>
      ))}
      {WALL_PLACES.map((p, i) => {
        const alongX = Math.abs(Math.cos(p.rotY)) > 0.5
        return (
          <mesh key={`w-${i}`} position={[p.x, 1.6, p.z]} rotation={[0, p.rotY, 0]} castShadow>
            <boxGeometry args={[alongX ? 4.2 : 0.45, 3.2, alongX ? 0.45 : 4.2]} />
            <meshStandardMaterial color="#4a3f38" />
          </mesh>
        )
      })}
      {extras.map((w, i) => (
        <mesh key={`e-${i}`} position={[w.cx, 1.4, w.cz]}>
          <boxGeometry args={[w.hx * 2, 2.8, w.hz * 2]} />
          <meshStandardMaterial color="#3d4a38" />
        </mesh>
      ))}
    </group>
  )
}
