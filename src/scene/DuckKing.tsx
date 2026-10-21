import { Component, useMemo, useRef, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store'

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

function Crown({ raging, y }: { raging?: boolean; y: number }) {
  return (
    <>
      <mesh position={[0, y, 0.02]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.1, 8]} />
        <meshStandardMaterial color={raging ? '#6a1212' : '#e8c547'} metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, y + 0.1, 0.02]} castShadow>
        <coneGeometry args={[0.11, 0.16, 6]} />
        <meshStandardMaterial color={raging ? '#ffb703' : '#f4d35e'} metalness={0.45} roughness={0.32} />
      </mesh>
    </>
  )
}

export function FallbackDuck({ moving, fleeing, raging, downed }: { moving: boolean; fleeing?: boolean; raging?: boolean; downed?: boolean }) {
  const body = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt * (fleeing ? 11 : moving ? 8 : 2.2)
    if (!body.current) return
    if (downed) {
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, 1.25, 8, dt)
      return
    }
    body.current.rotation.x = 0
    body.current.position.y = moving ? Math.abs(Math.sin(t.current)) * 0.045 : Math.sin(t.current * 0.5) * 0.012
    body.current.rotation.z = moving ? Math.sin(t.current) * 0.08 : 0
  })
  const skin = raging ? '#c45a4a' : '#f4c430'
  return (
    <group ref={body}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial color={skin} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.05, 0.18]} castShadow>
        <sphereGeometry args={[0.28, 14, 12]} />
        <meshStandardMaterial color={skin} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.0, 0.46]} rotation={[0.4, 0, 0]} castShadow>
        <coneGeometry args={[0.1, 0.28, 8]} />
        <meshStandardMaterial color="#ef9f27" />
      </mesh>
      <Crown raging={raging} y={1.32} />
    </group>
  )
}

function GltfDuck({ moving, fleeing, raging, downed }: { moving: boolean; fleeing?: boolean; raging?: boolean; downed?: boolean }) {
  const gltf = useGLTF(DUCK_URL)
  const body = useRef<THREE.Group>(null)
  const t = useRef(0)

  const { model, mats } = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    cloned.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = DUCK_TARGET_HEIGHT / Math.max(size.y, 0.001)
    cloned.scale.setScalar(s)
    cloned.position.y = -box.min.y * s
    return { model: cloned, mats: collectMats(cloned) }
  }, [gltf])

  useFrame((_, dt) => {
    t.current += dt * (fleeing ? 11 : moving ? 8 : 2.2)
    if (body.current) {
      if (downed) {
        body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, 1.2, 8, dt)
      } else {
        body.current.rotation.x = 0
        const swing = moving ? Math.sin(t.current) * (fleeing ? 0.14 : 0.08) : Math.sin(t.current * 0.35) * 0.03
        body.current.position.y = moving ? Math.abs(Math.sin(t.current)) * 0.045 : Math.sin(t.current * 0.5) * 0.012
        body.current.rotation.z = swing * 0.55
      }
    }
    for (const mat of mats) {
      if (!mat.color || mat.userData.base == null) continue
      mat.color.set(raging ? '#c45a4a' : mat.userData.base)
    }
  })

  return (
    <group ref={body}>
      <primitive object={model} />
      <Crown raging={raging} y={DUCK_TARGET_HEIGHT * 0.94} />
    </group>
  )
}

class DuckBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    const store = useAppStore.getState()
    store.addMapLoadError(DUCK_URL)
    store.setMapLoadFailed(true)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function DuckKingMesh({
  moving,
  fleeing,
  raging,
  downed,
}: {
  moving: boolean
  fleeing?: boolean
  raging?: boolean
  downed?: boolean
}) {
  const props = { moving, fleeing, raging, downed }
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[0.32, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      <DuckBoundary fallback={<FallbackDuck {...props} />}>
        <GltfDuck {...props} />
      </DuckBoundary>
    </group>
  )
}
