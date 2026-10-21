import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import { preloadFont } from 'troika-three-text'
import * as THREE from 'three'
import { useAppStore, type HitFx } from '../store'

// 字先在這一層載好。每次受擊如果新掛一個 Text，會再 suspend 一兩秒，
// 數字就錯過 0.5 秒。所以數字只用同一塊字，換字串，不重新掛載。
preloadFont({}, () => {})

const LIFE = 0.52

function DamageNumber() {
  const hits = useAppStore((s) => s.hits)
  const hit = hits[hits.length - 1]
  const hitRef = useRef(hit)
  hitRef.current = hit
  const anchor = useRef<THREE.Group>(null)
  const ref = useRef<THREE.Object3D & { text?: string; sync?: () => void }>(null)
  const ready = useRef(false)
  const note = () => {
    ready.current = true
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    const slot = window as Window & {
      __fontReady?: boolean
      __dmg?: { text: string; at: number; seen: number }
    }
    slot.__fontReady = true
    const mesh = ref.current
    const current = hitRef.current
    const text = current ? `-${current.amount}` : ''
    if (mesh && current && mesh.text === text) {
      if (!slot.__dmg || slot.__dmg.at !== current.at) {
        slot.__dmg = { text, at: current.at, seen: performance.now() }
      }
    }
  }
  useFrame(() => {
    const mesh = ref.current
    const root = anchor.current
    if (!mesh || !root) return
    if (!hit) {
      root.visible = !ready.current
      if (!ready.current) root.position.set(0, -30, 0)
      return
    }
    const age = (performance.now() - hit.at) / 1000
    const on = age >= 0 && age < LIFE
    root.visible = on
    if (!on) return
    root.position.set(hit.x, 1.7 + age * 1.4, hit.z)
    const text = `-${hit.amount}`
    if (mesh.text !== text) {
      mesh.text = text
      mesh.sync?.()
    }
  })
  return (
    <group ref={anchor} position={[0, -30, 0]}>
      <Billboard>
        <Text
          ref={ref}
          fontSize={0.34}
          color="#ffe8e4"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#8c140c"
          onSync={note}
        >
          -0123456789
        </Text>
      </Billboard>
    </group>
  )
}

function OneHit({ hit }: { hit: HitFx }) {
  const root = useRef<THREE.Group>(null)
  const flashMat = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const sparks = useRef<THREE.Group>(null)
  const dirs = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a), 0.45 + (i % 2) * 0.5, Math.sin(a))
      }),
    [],
  )

  useFrame(() => {
    const g = root.current
    if (!g) return
    const age = (performance.now() - hit.at) / 1000
    const on = age >= 0 && age < LIFE
    g.visible = on
    if (!on) return
    const k = age / LIFE
    const fade = 1 - k
    if (flashMat.current) flashMat.current.opacity = 0.62 * fade * fade
    if (ring.current) ring.current.scale.setScalar(0.35 + k * 2.6)
    if (ringMat.current) ringMat.current.opacity = 0.9 * fade
    if (light.current) light.current.intensity = 12 * fade * fade
    const group = sparks.current
    if (group) {
      for (let i = 0; i < dirs.length; i++) {
        const mesh = group.children[i] as THREE.Mesh | undefined
        if (!mesh) continue
        const d = dirs[i]
        const t = age * 3.1
        mesh.position.set(d.x * t, 1.05 + d.y * t, d.z * t)
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.opacity = fade
      }
    }
  })

  return (
    <group ref={root} position={[hit.x, 0, hit.z]} visible={false}>
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.72, 14, 10]} />
        <meshBasicMaterial ref={flashMat} color="#ff3b2f" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.48, 22]} />
        <meshBasicMaterial
          ref={ringMat}
          color="#ff5a3c"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <group ref={sparks}>
        {dirs.map((_, i) => (
          <mesh key={i} position={[0, 1.05, 0]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshBasicMaterial color={i % 2 ? '#ffe7a3' : '#ff4d3a'} transparent opacity={1} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.2, 0]} color="#ff4428" intensity={0} distance={6} decay={2} />
    </group>
  )
}

export function HitEffects() {
  const hits = useAppStore((s) => s.hits)
  return (
    <>
      <Suspense fallback={null}>
        <DamageNumber />
      </Suspense>
      {hits.map((h) => (
        <OneHit key={h.key} hit={h} />
      ))}
    </>
  )
}
