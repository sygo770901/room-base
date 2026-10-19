import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SKIN = '#e2b48a'
const HAIR = '#1a1412'
const SHIRT = '#161616'
const JEANS = '#8b8f97'
const SHOE = '#d9c5a3'
const SHOE_SOLE = '#c4b08a'
const LENS = '#1c1c1c'
const GLASS = '#9ad4e8'

export function DuckKingMesh({ moving, fleeing }: { moving: boolean; fleeing?: boolean }) {
  const arms = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const t = useRef(0)

  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.72, metalness: 0.04 }), [])
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55, metalness: 0.02 }), [])
  const hairMat = useMemo(() => new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.85 }), [])
  const jeanMat = useMemo(() => new THREE.MeshStandardMaterial({ color: JEANS, roughness: 0.78 }), [])
  const shoeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.5 }), [])
  const soleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHOE_SOLE, roughness: 0.7 }), [])
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: LENS, roughness: 0.35, metalness: 0.4 }), [])
  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GLASS,
        roughness: 0.05,
        metalness: 0.15,
        transparent: true,
        opacity: 0.28,
      }),
    [],
  )

  useFrame((_, dt) => {
    t.current += dt * (fleeing ? 11 : moving ? 8 : 2.2)
    const swing = moving ? Math.sin(t.current) * (fleeing ? 0.55 : 0.38) : Math.sin(t.current * 0.35) * 0.06
    if (arms.current) {
      const left = arms.current.children[0]
      const right = arms.current.children[1]
      if (left) left.rotation.x = swing
      if (right) right.rotation.x = -swing
    }
    if (body.current) {
      body.current.position.y = moving ? Math.abs(Math.sin(t.current)) * 0.035 : Math.sin(t.current * 0.5) * 0.012
    }
    if (head.current) {
      head.current.rotation.y = fleeing ? 0.55 : Math.sin(t.current * 0.2) * 0.08
      head.current.rotation.x = fleeing ? 0.12 : 0
    }
  })

  return (
    <group ref={body}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[0.26, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>

      {/* legs */}
      <mesh position={[-0.09, 0.46, 0]} castShadow material={jeanMat}>
        <cylinderGeometry args={[0.068, 0.078, 0.7, 10]} />
      </mesh>
      <mesh position={[0.09, 0.46, 0]} castShadow material={jeanMat}>
        <cylinderGeometry args={[0.068, 0.078, 0.7, 10]} />
      </mesh>
      {/* hips */}
      <mesh position={[0, 0.78, 0]} castShadow material={jeanMat}>
        <boxGeometry args={[0.3, 0.16, 0.18]} />
      </mesh>

      {/* shoes */}
      <mesh position={[-0.09, 0.075, 0.045]} castShadow material={shoeMat}>
        <boxGeometry args={[0.13, 0.09, 0.26]} />
      </mesh>
      <mesh position={[0.09, 0.075, 0.045]} castShadow material={shoeMat}>
        <boxGeometry args={[0.13, 0.09, 0.26]} />
      </mesh>
      <mesh position={[-0.09, 0.028, 0.04]} material={soleMat}>
        <boxGeometry args={[0.136, 0.035, 0.28]} />
      </mesh>
      <mesh position={[0.09, 0.028, 0.04]} material={soleMat}>
        <boxGeometry args={[0.136, 0.035, 0.28]} />
      </mesh>

      {/* torso / black shirt */}
      <mesh position={[0, 1.12, 0]} castShadow material={shirtMat}>
        <boxGeometry args={[0.36, 0.52, 0.2]} />
      </mesh>
      {/* collar */}
      <mesh position={[0, 1.38, 0.02]} rotation={[0.35, 0, 0]} material={shirtMat}>
        <boxGeometry args={[0.2, 0.06, 0.16]} />
      </mesh>
      <mesh position={[-0.08, 1.36, 0.06]} rotation={[0.4, 0, 0.5]} material={shirtMat}>
        <boxGeometry args={[0.1, 0.05, 0.08]} />
      </mesh>
      <mesh position={[0.08, 1.36, 0.06]} rotation={[0.4, 0, -0.5]} material={shirtMat}>
        <boxGeometry args={[0.1, 0.05, 0.08]} />
      </mesh>
      {/* yellow duck pin */}
      <mesh position={[0.12, 1.18, 0.106]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#f4c430" roughness={0.4} />
      </mesh>
      <mesh position={[0.148, 1.185, 0.11]}>
        <coneGeometry args={[0.012, 0.028, 6]} />
        <meshStandardMaterial color="#ef9f27" />
      </mesh>

      <group ref={arms}>
        <group position={[-0.22, 1.28, 0]}>
          <mesh position={[0, -0.18, 0]} rotation={[0, 0, 0.12]} castShadow material={shirtMat}>
            <cylinderGeometry args={[0.055, 0.05, 0.2, 8]} />
          </mesh>
          <mesh position={[0, -0.36, 0]} rotation={[0, 0, 0.08]} castShadow material={skinMat}>
            <cylinderGeometry args={[0.042, 0.038, 0.26, 8]} />
          </mesh>
          <mesh position={[0, -0.52, 0.01]} castShadow material={skinMat}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </mesh>
        </group>
        <group position={[0.22, 1.28, 0]}>
          <mesh position={[0, -0.18, 0]} rotation={[0, 0, -0.12]} castShadow material={shirtMat}>
            <cylinderGeometry args={[0.055, 0.05, 0.2, 8]} />
          </mesh>
          <mesh position={[0, -0.36, 0]} rotation={[0, 0, -0.08]} castShadow material={skinMat}>
            <cylinderGeometry args={[0.042, 0.038, 0.26, 8]} />
          </mesh>
          <mesh position={[0, -0.52, 0.01]} castShadow material={skinMat}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </mesh>
        </group>
      </group>

      <group ref={head} position={[0, 1.52, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow material={skinMat}>
          <sphereGeometry args={[0.155, 18, 14]} />
        </mesh>
        {/* ears */}
        <mesh position={[-0.15, 0.16, 0]} material={skinMat}>
          <sphereGeometry args={[0.032, 8, 6]} />
        </mesh>
        <mesh position={[0.15, 0.16, 0]} material={skinMat}>
          <sphereGeometry args={[0.032, 8, 6]} />
        </mesh>
        {/* short black hair */}
        <mesh position={[0, 0.22, -0.01]} scale={[1.02, 0.58, 1.08]} material={hairMat}>
          <sphereGeometry args={[0.162, 16, 12]} />
        </mesh>
        <mesh position={[0, 0.14, -0.12]} material={hairMat}>
          <boxGeometry args={[0.28, 0.12, 0.08]} />
        </mesh>
        {/* brows */}
        <mesh position={[-0.05, 0.21, 0.13]} rotation={[0.2, 0, 0.15]} material={hairMat}>
          <boxGeometry args={[0.06, 0.012, 0.012]} />
        </mesh>
        <mesh position={[0.05, 0.21, 0.13]} rotation={[0.2, 0, -0.15]} material={hairMat}>
          <boxGeometry args={[0.06, 0.012, 0.012]} />
        </mesh>
        {/* glasses */}
        <mesh position={[-0.055, 0.175, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={frameMat}>
          <torusGeometry args={[0.042, 0.007, 8, 16]} />
        </mesh>
        <mesh position={[0.055, 0.175, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={frameMat}>
          <torusGeometry args={[0.042, 0.007, 8, 16]} />
        </mesh>
        <mesh position={[-0.055, 0.175, 0.14]} material={glassMat}>
          <circleGeometry args={[0.038, 16]} />
        </mesh>
        <mesh position={[0.055, 0.175, 0.14]} material={glassMat}>
          <circleGeometry args={[0.038, 16]} />
        </mesh>
        <mesh position={[0, 0.175, 0.14]} material={frameMat}>
          <boxGeometry args={[0.028, 0.008, 0.008]} />
        </mesh>
        <mesh position={[-0.095, 0.17, 0.08]} rotation={[0, 0.6, 0]} material={frameMat}>
          <boxGeometry args={[0.05, 0.008, 0.008]} />
        </mesh>
        <mesh position={[0.095, 0.17, 0.08]} rotation={[0, -0.6, 0]} material={frameMat}>
          <boxGeometry args={[0.05, 0.008, 0.008]} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.055, 0.172, 0.148]}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[0.055, 0.172, 0.148]}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        {/* nose / mouth */}
        <mesh position={[0, 0.145, 0.148]} material={skinMat}>
          <sphereGeometry args={[0.018, 8, 6]} />
        </mesh>
        <mesh position={[0, 0.118, 0.145]}>
          <boxGeometry args={[0.04, 0.006, 0.008]} />
          <meshStandardMaterial color="#b07a68" />
        </mesh>
      </group>
    </group>
  )
}
