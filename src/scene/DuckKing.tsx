import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export const DUCK_URL = '/assets/duck/Duck.glb'
/** 鴨王目標身高（先定，昱豪可改） */
export const DUCK_TARGET_HEIGHT = 1.68

useGLTF.preload(DUCK_URL)

function collectMats(root: THREE.Object3D) {
  const mats: THREE.MeshStandardMaterial[] = []
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const raw = mesh.material
    const list = Array.isArray(raw) ? raw : [raw]
    mesh.material = list.map((m) => {
      const cloned = (m as THREE.Material).clone() as THREE.MeshStandardMaterial
      if (cloned.color) cloned.userData.base = cloned.color.getHex()
      mats.push(cloned)
      return cloned
    })
  })
  return mats
}

export function DuckKingMesh({ moving, fleeing, raging }: { moving: boolean; fleeing?: boolean; raging?: boolean }) {
  const gltf = useGLTF(DUCK_URL)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const t = useRef(0)

  const { model, mats } = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = DUCK_TARGET_HEIGHT / Math.max(size.y, 0.001)
    cloned.scale.setScalar(s)
    cloned.position.y = -box.min.y * s
    const collected = collectMats(cloned)
    return { model: cloned, mats: collected }
  }, [gltf])

  useFrame((_, dt) => {
    t.current += dt * (fleeing ? 11 : moving ? 8 : 2.2)
    const swing = moving ? Math.sin(t.current) * (fleeing ? 0.14 : 0.08) : Math.sin(t.current * 0.35) * 0.03
    if (body.current) {
      body.current.position.y = moving ? Math.abs(Math.sin(t.current)) * 0.045 : Math.sin(t.current * 0.5) * 0.012
      body.current.rotation.z = swing * 0.55
    }
    if (head.current) {
      head.current.rotation.y = fleeing ? 0.4 : Math.sin(t.current * 0.2) * 0.08
      head.current.rotation.x = fleeing ? 0.1 : 0
    }
    for (const mat of mats) {
      if (!mat.color || mat.userData.base == null) continue
      mat.color.set(raging ? '#c45a4a' : mat.userData.base)
    }
  })

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[0.32, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      <group ref={body}>
        <group ref={head}>
          <primitive object={model} />
          <mesh position={[0, DUCK_TARGET_HEIGHT * 0.94, 0.02]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 0.1, 8]} />
            <meshStandardMaterial color={raging ? '#6a1212' : '#e8c547'} metalness={0.55} roughness={0.28} />
          </mesh>
          <mesh position={[0, DUCK_TARGET_HEIGHT * 1.04, 0.02]} castShadow>
            <coneGeometry args={[0.11, 0.16, 6]} />
            <meshStandardMaterial color={raging ? '#ffb703' : '#f4d35e'} metalness={0.45} roughness={0.32} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
