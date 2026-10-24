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
import { HEIGHTLAB_PLACES } from '../../shared/heightlab'
import { KAYKIT_PLACES } from '../../shared/kaykitScene'
import { usesKaykitKit } from '../../shared/mapData'
import { placeSetFor } from '../../shared/scenes'
import { SAMPLE_PLACES } from '../../shared/sampleRoom'
import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'
import { writeInstanceMatrices } from './occlusion'

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

function partsOf(scene: THREE.Object3D, glow = 0, keepDoor = false): Part[] {
  scene.updateMatrixWorld(true)
  const parts: Part[] = []
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    if (!keepDoor && (isBakedDoorMesh(mesh.name) || isBakedDoorMesh(obj.name) || isBakedDoorMesh(obj.parent?.name || ''))) return
    let material = mesh.material
    if (glow > 0) {
      const src = Array.isArray(material) ? material[0] : material
      if (src && 'emissive' in src) {
        const lit = (src as THREE.MeshStandardMaterial).clone()
        lit.emissive = new THREE.Color('#ff8a3a')
        lit.emissiveIntensity = glow
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

function InstanceChunk({ part, places, cast, model }: { part: Part; places: Place[]; cast: boolean; model: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || places.length === 0) return
    writeInstanceMatrices(mesh, places, part.matrix)
  }, [part, places])

  if (places.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, places.length]}
      castShadow={cast}
      receiveShadow
      frustumCulled
      userData={{ model }}
    />
  )
}

function KitModel({
  root,
  model,
  places,
  glow,
  openDoor,
}: {
  root: string
  model: string
  places: Place[]
  glow: number
  openDoor: boolean
}) {
  const gltf = useGLTF(`${root}/${model}`)
  const parts = useMemo(() => {
    const src = openDoor ? gltf.scene.clone(true) : gltf.scene
    if (openDoor) {
      src.traverse((obj) => {
        if (obj.name === 'wall_doorway_door') obj.rotation.y = -Math.PI / 2
      })
      src.updateMatrixWorld(true)
    }
    return partsOf(src, model.startsWith('torch') ? glow : 0, openDoor)
  }, [gltf, model, glow, openDoor])
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
      model.startsWith('stairs') ||
      model.startsWith('skeleton') ||
      model.startsWith('chest') ||
      model.startsWith('barrel') ||
      model.startsWith('box_'))
  return (
    <group>
      {chunks.map((chunk, chunkIndex) =>
        parts.map((part, partIndex) => (
          <InstanceChunk
            key={`${chunkIndex}-${partIndex}`}
            part={part}
            places={chunk}
            cast={cast}
            model={model}
          />
        )),
      )}
    </group>
  )
}

function placesFor(scene: string) {
  const set = placeSetFor(scene)
  if (set === 'heightlab') return HEIGHTLAB_PLACES
  if (set === 'sample') return SAMPLE_PLACES
  if (set === 'kaykit') return KAYKIT_PLACES
  return KENNEY_PLACES
}

/** 鏡頭射線只打這組，不會打到角色自己。 */
export const DUNGEON_OCCLUSION = 'dungeon-occlusion'

export function dungeonModelUrls(scene: string) {
  const fallback = scene === 'heightlab' || usesKaykitKit(scene) || scene === 'sample' ? KAYKIT_ROOT : KENNEY_ROOT
  return [...new Set(placesFor(scene).map((p) => `${p.root ?? fallback}/${p.model}`))]
}

export function Dungeon(_props: { focusX: number; focusZ: number }) {
  const scene = useAppStore((s) => s.scene)
  const root = scene === 'heightlab' || usesKaykitKit(scene) || scene === 'sample' ? KAYKIT_ROOT : KENNEY_ROOT
  const places = placesFor(scene)
  const glow = scene === 'sample' ? 2.6 : 1.15
  const groups = useMemo(() => {
    const map = new Map<string, { root: string; model: string; places: Place[] }>()
    for (const place of places) {
      const placeRoot = place.root ?? root
      const key = `${placeRoot}/${place.model}`
      const hit = map.get(key)
      if (hit) hit.places.push(place)
      else map.set(key, { root: placeRoot, model: place.model, places: [place] })
    }
    return [...map.values()]
  }, [places, root])

  return (
    <group name={DUNGEON_OCCLUSION}>
      {groups.map((group) => (
        <KitModel
          key={`${group.root}/${group.model}`}
          root={group.root}
          model={group.model}
          places={group.places}
          glow={glow}
          openDoor={scene === 'sample' && group.model === 'wall_doorway.gltf'}
        />
      ))}
    </group>
  )
}
