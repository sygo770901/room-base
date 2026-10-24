import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isMobileDevice } from '../perf/device'
import { groundY } from '../../shared/heightfield'
import { heightFieldOf } from '../../shared/heightmaps'
import { POOP_FLIGHT_MS, type SmokeCloud } from '../../shared/smoke'
import { playSfx } from '../audio/sfx'
import { useAppStore } from '../store'

const _poopNdc = new THREE.Vector3()
const FLY_COUNT = isMobileDevice() ? 4 : 16
const SPLAT_COUNT = isMobileDevice() ? 6 : 20

function flightT(c: SmokeCloud, now: number) {
  const start = c.thrownAt ?? now
  const land = c.landAt ?? start + POOP_FLIGHT_MS
  return Math.max(0, Math.min(1, (now - start) / Math.max(1, land - start)))
}

function groundAt(x: number, z: number) {
  const field = heightFieldOf(useAppStore.getState().scene)
  if (!field) return 0
  return groundY(field, x, z) ?? 0
}

function poopPos(c: SmokeCloud, now: number) {
  const t = flightT(c, now)
  const ox = c.ox ?? c.x
  const oz = c.oz ?? c.z
  const y0 = groundAt(ox, oz)
  const y1 = groundAt(c.x, c.z)
  return {
    x: ox + (c.x - ox) * t,
    y: y0 + (y1 - y0) * t + 0.35 + Math.sin(t * Math.PI) * 2.1,
    z: oz + (c.z - oz) * t,
    t,
  }
}

function PoopBody({
  cloud,
  cloudMat,
  stainMat,
}: {
  cloud: SmokeCloud
  cloudMat: THREE.Material
  stainMat: THREE.Material
}) {
  const ball = useRef<THREE.Mesh>(null)
  const stain = useRef<THREE.Mesh>(null)
  const puff = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const now = Date.now()
    const gone = cloud.until <= now
    const p = poopPos(cloud, now)
    const gy = groundAt(cloud.x, cloud.z)
    const flying = !gone && p.t < 1
    if (ball.current) {
      ball.current.visible = flying
      if (flying) ball.current.position.set(p.x, p.y, p.z)
    }
    const life = Math.max(0, (cloud.until - now) / 8000)
    if (stain.current) {
      stain.current.visible = !gone && !flying
      stain.current.position.set(cloud.x, gy + 0.04, cloud.z)
      const radius = 0.55 * life + 0.25
      stain.current.scale.set(radius, radius, radius)
    }
    if (puff.current) {
      puff.current.visible = !gone && !flying
      puff.current.position.set(cloud.x, gy + 1.05, cloud.z)
    }
  })
  return (
    <group>
      <mesh ref={ball} visible={false} frustumCulled={false}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#6b3a18" emissive="#c46a28" emissiveIntensity={1.6} roughness={0.55} />
      </mesh>
      <mesh ref={stain} rotation-x={-Math.PI / 2} material={stainMat} visible={false}>
        <circleGeometry args={[1, 12]} />
      </mesh>
      <mesh ref={puff} material={cloudMat} visible={false}>
        <sphereGeometry args={[cloud.r * 0.72, 12, 10]} />
      </mesh>
    </group>
  )
}

export function SmokeClouds() {
  const smokes = useAppStore((s) => s.smokes)
  const heard = useRef(new Set<string>())
  const heardStick = useRef(new Map<string, number>())
  const flyDummy = useMemo(() => new THREE.Object3D(), [])
  const splatDummy = useMemo(() => new THREE.Object3D(), [])
  const flies = useRef<THREE.InstancedMesh>(null)
  const splats = useRef<THREE.InstancedMesh>(null)

  const cloudMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#d4ee7a', transparent: true, opacity: 0.36, depthWrite: false }),
    [],
  )
  const stainMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#4a2c14', transparent: true, opacity: 0.45, depthWrite: false }),
    [],
  )

  useFrame(({ clock, camera }) => {
    const now = Date.now()
    const live = smokes.filter((c) => c.until > now)
    if (live.length !== smokes.length) useAppStore.getState().setSmokes(live)
    const t = clock.elapsedTime
    let fi = 0
    let si = 0
    const flyMesh = flies.current
    const splatMesh = splats.current
    for (const c of live) {
      if ((c.r ?? 0) > 0 && !heard.current.has(c.id)) {
        heard.current.add(c.id)
        playSfx('poop')
      }
      const p = poopPos(c, now)
      const landed = p.t >= 1
      const gy = groundAt(c.x, c.z)
      const nFly = isMobileDevice() ? 2 : 5
      for (const stick of c.sticks ?? []) {
        const prevUntil = heardStick.current.get(stick.id) ?? 0
        if (stick.until > prevUntil) {
          heardStick.current.set(stick.id, stick.until)
          const selfId = useAppStore.getState().selfId
          if (selfId && (stick.id === selfId || c.throwerId === selfId)) playSfx('hit')
        }
      }
      if ((c.r ?? 0) <= 0) continue
      for (let i = 0; i < nFly && flyMesh; i++) {
        const a = t * 3.4 + i * 1.7 + c.x
        flyDummy.position.set(p.x + Math.cos(a) * 0.28, p.y + 0.18 + Math.sin(a * 1.6) * 0.1, p.z + Math.sin(a) * 0.28)
        flyDummy.scale.setScalar(0.035)
        flyDummy.updateMatrix()
        flyMesh.setMatrixAt(fi++, flyDummy.matrix)
      }
      if (landed && splatMesh) {
        for (let i = 0; i < (isMobileDevice() ? 3 : 10); i++) {
          const a = i * 0.7
          splatDummy.position.set(c.x + Math.cos(a) * 0.22, gy + 0.06 + (i % 3) * 0.05, c.z + Math.sin(a) * 0.22)
          splatDummy.scale.setScalar(0.07)
          splatDummy.updateMatrix()
          splatMesh.setMatrixAt(si++, splatDummy.matrix)
        }
      }
    }
    if (import.meta.env.DEV) {
      const slot = window as Window & { __poop?: { id: string; x: number; y: number; z: number; t: number; gy: number }[] }
      const pack = (c: SmokeCloud) => {
        const p = poopPos(c, now)
        const ndc = _poopNdc.set(p.x, p.y, p.z).project(camera)
        return {
          id: c.id,
          x: p.x,
          y: p.y,
          z: p.z,
          t: p.t,
          gy: groundAt(c.x, c.z),
          until: c.until,
          thrownAt: c.thrownAt,
          landAt: c.landAt,
          now,
          nx: ndc.x,
          ny: ndc.y,
          nz: ndc.z,
          lx: c.x,
          lz: c.z,
          ox: c.ox ?? c.x,
          oz: c.oz ?? c.z,
        }
      }
      slot.__poop = live.filter((c) => (c.r ?? 0) > 0).map(pack)
      const slotAll = window as Window & { __allSmokes?: ReturnType<typeof pack>[] }
      slotAll.__allSmokes = smokes.map(pack)
    }
    if (flyMesh) {
      flyMesh.count = fi
      flyMesh.instanceMatrix.needsUpdate = true
    }
    if (splatMesh) {
      splatMesh.count = si
      splatMesh.instanceMatrix.needsUpdate = true
    }
  }, -1)

  return (
    <group>
      <instancedMesh ref={flies} args={[undefined, undefined, FLY_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial color="#1a140c" />
      </instancedMesh>
      <instancedMesh ref={splats} args={[undefined, undefined, SPLAT_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial color="#5a3018" />
      </instancedMesh>
      {smokes.map((c) =>
        (c.r ?? 0) > 0 ? <PoopBody key={c.id} cloud={c} cloudMat={cloudMat} stainMat={stainMat} /> : null,
      )}
    </group>
  )
}
