import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import {
  CORNER_PLACES,
  FLOOR_DECALS,
  FLOOR_PLACES,
  PROP_LIST,
  WALL_PLACES,
  type Place,
} from '../../shared/dungeon'

const CHUNK = 32
const ROOT = '/assets/kenney/dungeon'

const ALL_PLACES: Place[] = [
  ...FLOOR_PLACES,
  ...FLOOR_DECALS,
  ...WALL_PLACES,
  ...CORNER_PLACES,
  ...PROP_LIST.map((prop) => ({
    x: prop.x,
    y: prop.y,
    z: prop.z,
    rotY: prop.rotY,
    model: prop.model,
  })),
]

for (const name of new Set(ALL_PLACES.map((place) => place.model))) {
  useGLTF.preload(`${ROOT}/${name}`)
}

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

function InstanceChunk({ part, places, cast }: { part: Part; places: Place[]; cast: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || places.length === 0) return
    const dummy = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      dummy.position.set(place.x, place.y, place.z)
      dummy.rotation.set(0, place.rotY, 0)
      dummy.scale.setScalar(place.scale ?? 1)
      dummy.updateMatrix()
      matrix.multiplyMatrices(dummy.matrix, part.matrix)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.frustumCulled = true
  }, [part, places])

  if (places.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, places.length]}
      castShadow={cast}
      receiveShadow
      frustumCulled
    />
  )
}

function KitModel({ model, places }: { model: string; places: Place[] }) {
  const gltf = useGLTF(`${ROOT}/${model}`)
  const parts = useMemo(() => partsOf(gltf.scene), [gltf])
  const chunks = useMemo(() => {
    const map = new Map<string, Place[]>()
    for (const place of places) {
      const key = `${Math.floor(place.x / CHUNK)}:${Math.floor(place.z / CHUNK)}`
      const list = map.get(key)
      if (list) list.push(place)
      else map.set(key, [place])
    }
    return [...map.values()]
  }, [places])
  const cast = model.startsWith('template-detail')
  return (
    <group>
      {chunks.map((chunk, chunkIndex) =>
        parts.map((part, partIndex) => (
          <InstanceChunk
            key={`${chunkIndex}-${partIndex}`}
            part={part}
            places={chunk}
            cast={cast}
          />
        )),
      )}
    </group>
  )
}

export function Dungeon(_props: { focusX: number; focusZ: number }) {
  const groups = useMemo(() => {
    const map = new Map<string, Place[]>()
    for (const place of ALL_PLACES) {
      const list = map.get(place.model) ?? []
      list.push(place)
      map.set(place.model, list)
    }
    return [...map.entries()]
  }, [])

  return (
    <group>
      {groups.map(([model, places]) => (
        <KitModel key={model} model={model} places={places} />
      ))}
    </group>
  )
}
