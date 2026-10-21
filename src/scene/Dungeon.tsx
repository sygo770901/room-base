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
import { isBakedDoorMesh } from '../../shared/doorways'
import { KAYKIT_PLACES } from '../../shared/kaykitScene'
import { usesKaykitKit } from '../../shared/mapData'
import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'

const CHUNK = 32
const KENNEY_ROOT = '/assets/kenney/dungeon'
const KAYKIT_ROOT = '/assets/kaykit/dungeon-1.1'

const KENNEY_PLACES: Place[] = [
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

type Part = {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  matrix: THREE.Matrix4
}

function partsOf(scene: THREE.Object3D, glow = false): Part[] {
  scene.updateMatrixWorld(true)
  const parts: Part[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    if (isBakedDoorMesh(mesh.name) || isBakedDoorMesh(obj.name) || isBakedDoorMesh(obj.parent?.name || '')) return
    let material = mesh.material
    if (glow) {
      const src = Array.isArray(material) ? material[0] : material
      if (src && 'emissive' in src) {
        const lit = (src as THREE.MeshStandardMaterial).clone()
        lit.emissive = new THREE.Color('#ff8a3a')
        lit.emissiveIntensity = 1.15
        material = lit
      }
    }
    parts.push({
      geometry: mesh.geometry,
      material,
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

function KitModel({ root, model, places }: { root: string; model: string; places: Place[] }) {
  const gltf = useGLTF(`${root}/${model}`)
  const parts = useMemo(() => partsOf(gltf.scene, model.startsWith('torch')), [gltf, model])
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
  const mobile = isMobileDevice()
  const cast =
    !mobile &&
    (model.startsWith('template-detail') ||
      model.startsWith('pillar') ||
      model.startsWith('crates') ||
      model.startsWith('stairs'))
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

export function dungeonModelUrls(scene: string) {
  const root = usesKaykitKit(scene) ? KAYKIT_ROOT : KENNEY_ROOT
  const places = usesKaykitKit(scene) ? KAYKIT_PLACES : KENNEY_PLACES
  return [...new Set(places.map((p) => `${root}/${p.model}`))]
}

export function Dungeon(_props: { focusX: number; focusZ: number }) {
  const scene = useAppStore((s) => s.scene)
  const root = usesKaykitKit(scene) ? KAYKIT_ROOT : KENNEY_ROOT
  const places = usesKaykitKit(scene) ? KAYKIT_PLACES : KENNEY_PLACES
  const groups = useMemo(() => {
    const map = new Map<string, Place[]>()
    for (const place of places) {
      const list = map.get(place.model) ?? []
      list.push(place)
      map.set(place.model, list)
    }
    return [...map.entries()]
  }, [places])

  return (
    <group>
      {groups.map(([model, list]) => (
        <KitModel key={`${root}/${model}`} root={root} model={model} places={list} />
      ))}
    </group>
  )
}
