import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { FLOOR_PLACES, PROP_LIST, WALL_PLACES, type Place } from '../../shared/dungeon'

const FLOOR_URL = '/assets/kaykit/tileBrickA_medium.gltf.glb'
const WALL_URL = '/assets/kaykit/wall.gltf.glb'

useGLTF.preload(FLOOR_URL)
useGLTF.preload(WALL_URL)

const PROP_MODELS = [...new Set(PROP_LIST.map((p) => p.model))]
for (const name of PROP_MODELS) useGLTF.preload(`/assets/kaykit/${name}`)

type Part = {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  matrix: THREE.Matrix4
}

function partsOf(scene: THREE.Object3D): Part[] {
  scene.updateMatrixWorld(true)
  const parts: Part[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    parts.push({
      geometry: mesh.geometry,
      material: mesh.material,
      matrix: mesh.matrixWorld.clone(),
    })
  })
  return parts
}

function InstanceChunk({ part, places, cast }: { part: Part; places: Place[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || places.length === 0) return
    const dummy = new THREE.Object3D()
    const m = new THREE.Matrix4()
    for (let i = 0; i < places.length; i++) {
      const p = places[i]
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(0, p.rotY, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      m.multiplyMatrices(dummy.matrix, part.matrix)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [part, places])

  if (places.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, places.length]}
      castShadow={!!cast}
      receiveShadow
      frustumCulled={false}
    />
  )
}

function KaykitInstances({ url, places, cast }: { url: string; places: Place[]; cast?: boolean }) {
  const gltf = useGLTF(url)
  const parts = useMemo(() => partsOf(gltf.scene), [gltf])
  return (
    <group>
      {parts.map((part, i) => (
        <InstanceChunk key={i} part={part} places={places} cast={cast} />
      ))}
    </group>
  )
}

export function Dungeon() {
  const floors = useMemo(
    () => FLOOR_PLACES.map((p, i) => ({ ...p, rotY: (i % 4) * (Math.PI / 2) })),
    [],
  )
  const propGroups = useMemo(() => {
    const map = new Map<string, Place[]>()
    for (const p of PROP_LIST) {
      const list = map.get(p.model) ?? []
      list.push({ x: p.x, y: p.y, z: p.z, rotY: p.rotY })
      map.set(p.model, list)
    }
    return [...map.entries()]
  }, [])
  const lights = PROP_LIST.filter((p) => p.light).slice(0, 8)

  return (
    <group>
      <KaykitInstances url={FLOOR_URL} places={floors} />
      <KaykitInstances url={WALL_URL} places={WALL_PLACES} cast />
      {propGroups.map(([model, places]) => (
        <KaykitInstances key={model} url={`/assets/kaykit/${model}`} places={places} cast />
      ))}
      {lights.map((p) => (
        <pointLight
          key={p.id}
          position={[p.x, 1.8, p.z]}
          color="#ff9a45"
          intensity={7}
          distance={14}
          decay={2}
        />
      ))}
    </group>
  )
}
