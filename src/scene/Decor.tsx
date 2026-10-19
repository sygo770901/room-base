import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ALL_DECOR, DECOR_URL, type DecorItem } from '../../shared/decor'
import { KAYKIT_TORCHES } from '../../shared/kaykitScene'
import { usesKaykitKit } from '../../shared/mapData'
import { useAppStore } from '../store'

function DecorGroup({ model, items }: { model: DecorItem['model']; items: DecorItem[] }) {
  const gltf = useGLTF(DECOR_URL[model])
  const meshes = useMemo(() => {
    const list: { geom: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[] = []
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      list.push({ geom: m.geometry, mat: m.material })
    })
    return list
  }, [gltf.scene])

  return (
    <group>
      {items.map((p, i) => (
        <group key={`${model}-${i}`} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]} scale={p.scale ?? 1}>
          {meshes.map((part, j) => (
            <mesh key={j} geometry={part.geom} material={part.mat} castShadow={false} receiveShadow />
          ))}
        </group>
      ))}
    </group>
  )
}

function TorchHalos() {
  const mats = useRef<THREE.MeshBasicMaterial[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mats.current.forEach((mat, i) => {
      const n = Math.sin(t * (7.1 + (i % 5) * 0.73) + i * 1.7) * 0.18 + Math.sin(t * (13.4 + i) + i) * 0.1
      mat.opacity = 0.28 + n
    })
  })
  return (
    <group>
      {KAYKIT_TORCHES.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.z]}>
          <sphereGeometry args={[0.22, 8, 6]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[i] = m
            }}
            color="#ffb066"
            transparent
            opacity={0.32}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function SceneDecor() {
  const scene = useAppStore((s) => s.scene)
  const byModel = useMemo(() => {
    const map = new Map<DecorItem['model'], DecorItem[]>()
    for (const d of ALL_DECOR) {
      const list = map.get(d.model) ?? []
      list.push(d)
      map.set(d.model, list)
    }
    return [...map.entries()]
  }, [])
  if (!usesKaykitKit(scene) && scene !== 'kenney') return null
  return (
    <group>
      {byModel.map(([model, items]) => (
        <DecorGroup key={model} model={model} items={items} />
      ))}
      {usesKaykitKit(scene) && <TorchHalos />}
    </group>
  )
}

for (const url of Object.values(DECOR_URL)) useGLTF.preload(url)
