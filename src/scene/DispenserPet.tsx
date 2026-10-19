import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { isMobileDevice } from '../perf/device'

const WHITE = '#f3f4f6'
const STEEL = '#8e969d'
const DARK = '#1f2428'
const PURPLE = '#b9a6ff'
const PANEL = '#eceff3'

export function DispenserPetMesh({ pouncing, lit }: { pouncing?: boolean; lit?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const t = useRef(0)

  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.38, metalness: 0.08 }), [])
  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.28, metalness: 0.72 }),
    [],
  )
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.55 }), [])
  const meshMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a3036', roughness: 0.7, metalness: 0.2 }),
    [],
  )

  useFrame((_, dt) => {
    t.current += dt
    const pulse = pouncing ? 0.55 + Math.sin(t.current * 14) * 0.45 : 0.22 + Math.sin(t.current * 2.2) * 0.08
    if (glow.current) {
      glow.current.emissiveIntensity = 1.2 + pulse * 2.4
      glow.current.opacity = 0.72 + pulse * 0.2
    }
    if (light.current) light.current.intensity = (pouncing ? 4.8 : 1.6) + pulse * 2
    if (root.current) {
      root.current.position.y = Math.sin(t.current * (pouncing ? 10 : 2.4)) * (pouncing ? 0.05 : 0.015)
      root.current.rotation.x = pouncing ? -0.18 : Math.sin(t.current * 1.4) * 0.02
    }
  })

  const slats = useMemo(() => Array.from({ length: 9 }, (_, i) => i), [])

  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.32, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} />
      </mesh>

      {/* lower cabinet */}
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow material={white}>
        <boxGeometry args={[0.46, 0.68, 0.4]} />
      </mesh>
      {/* upper tank */}
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow material={white}>
        <boxGeometry args={[0.46, 0.5, 0.4]} />
      </mesh>
      {/* seam */}
      <mesh position={[0, 0.68, 0.201]} material={dark}>
        <boxGeometry args={[0.46, 0.012, 0.004]} />
      </mesh>

      {/* top deck */}
      <mesh position={[0, 1.18, 0]} material={white}>
        <boxGeometry args={[0.46, 0.04, 0.4]} />
      </mesh>
      <mesh position={[0, 1.205, -0.02]}>
        <boxGeometry args={[0.4, 0.008, 0.28]} />
        <meshStandardMaterial color={PANEL} roughness={0.25} />
      </mesh>
      {/* rear intake mesh */}
      <mesh position={[0, 1.208, -0.14]} material={meshMat}>
        <boxGeometry args={[0.4, 0.012, 0.1]} />
      </mesh>
      {/* water-drop button */}
      <mesh position={[0.04, 1.216, 0.04]}>
        <sphereGeometry args={[0.018, 10, 8]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.6} />
      </mesh>

      {/* circular window + purple chamber */}
      <mesh position={[0.08, 0.96, 0.21]} material={white}>
        <cylinderGeometry args={[0.145, 0.145, 0.04, 24]} />
      </mesh>
      <mesh position={[0.08, 0.96, 0.228]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.118, 0.14, 24]} />
        <meshStandardMaterial color="#dfe4ea" roughness={0.3} />
      </mesh>
      <mesh position={[0.08, 0.96, 0.22]}>
        <circleGeometry args={[0.12, 24]} />
        <meshStandardMaterial
          ref={glow}
          color={PURPLE}
          emissive="#8b6cff"
          emissiveIntensity={2}
          transparent
          opacity={0.82}
        />
      </mesh>
      <mesh position={[0.08, 0.96, 0.12]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#7c3aed" emissiveIntensity={0.8} transparent opacity={0.45} />
      </mesh>
      {lit && !isMobileDevice() ? (
        <pointLight ref={light} position={[0.08, 0.96, 0.22]} color="#b794f6" intensity={2} distance={4.5} />
      ) : null}

      {/* status dots */}
      {[-0.04, 0, 0.04].map((x) => (
        <mesh key={x} position={[0.08 + x, 0.8, 0.205]}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}

      {/* front vertical grille */}
      <group position={[-0.12, 0.36, 0.205]}>
        <mesh material={meshMat}>
          <boxGeometry args={[0.09, 0.46, 0.012]} />
        </mesh>
        {slats.map((i) => (
          <mesh key={i} position={[0, -0.2 + i * 0.05, 0.004]} material={dark}>
            <boxGeometry args={[0.078, 0.008, 0.006]} />
          </mesh>
        ))}
      </group>

      {/* side circular blank */}
      <mesh position={[0.232, 0.96, 0]} rotation={[0, 0, Math.PI / 2]} material={white}>
        <cylinderGeometry args={[0.13, 0.13, 0.02, 24]} />
      </mesh>
      <mesh position={[0.242, 0.96, 0]} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.11, 0.13, 24]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[-0.232, 0.36, 0]} rotation={[0, 0, Math.PI / 2]} material={white}>
        <boxGeometry args={[0.16, 0.02, 0.12]} />
      </mesh>

      {/* stainless back */}
      <mesh position={[0, 0.86, -0.205]} material={steel}>
        <boxGeometry args={[0.44, 0.62, 0.012]} />
      </mesh>
      {/* handle cutout */}
      <mesh position={[0, 1.08, -0.212]} material={dark}>
        <boxGeometry args={[0.16, 0.05, 0.01]} />
      </mesh>
      {/* switch */}
      <mesh position={[0.12, 0.92, -0.214]}>
        <boxGeometry args={[0.04, 0.06, 0.012]} />
        <meshStandardMaterial color="#efefef" />
      </mesh>
      <mesh position={[0.12, 0.935, -0.222]}>
        <boxGeometry args={[0.03, 0.02, 0.008]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      {/* QR placeholder */}
      <mesh position={[-0.12, 0.9, -0.214]} material={dark}>
        <boxGeometry args={[0.07, 0.07, 0.006]} />
      </mesh>
      {/* lower back vent */}
      <mesh position={[0, 0.28, -0.205]} material={meshMat}>
        <boxGeometry args={[0.12, 0.16, 0.01]} />
      </mesh>

      {/* power cord */}
      <mesh position={[-0.08, 0.62, -0.24]} rotation={[0.9, 0, 0.2]} material={dark}>
        <cylinderGeometry args={[0.012, 0.012, 0.28, 8]} />
      </mesh>
      <mesh position={[-0.1, 0.08, -0.34]} rotation={[1.3, 0, 0.1]} material={dark}>
        <cylinderGeometry args={[0.012, 0.012, 0.36, 8]} />
      </mesh>

      <Text
        position={[-0.205, 0.98, 0.08]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.045}
        color="#6b7280"
        anchorX="center"
        anchorY="middle"
      >
        ARKVO
      </Text>
    </group>
  )
}
