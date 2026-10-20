import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isMobileDevice } from '../perf/device'
import { POOP_FLIGHT_MS, type SmokeCloud } from '../../shared/smoke'
import { playSfx } from '../audio/sfx'
import { useAppStore } from '../store'

const FLY_COUNT = isMobileDevice() ? 8 : 16
const SPLAT_COUNT = isMobileDevice() ? 10 : 20

function flightT(c: SmokeCloud, now: number) {
  const start = c.thrownAt ?? now
  const land = c.landAt ?? start + POOP_FLIGHT_MS
  return Math.max(0, Math.min(1, (now - start) / Math.max(1, land - start)))
}

function poopPos(c: SmokeCloud, now: number) {
  const t = flightT(c, now)
  const ox = c.ox ?? c.x
  const oz = c.oz ?? c.z
  return {
    x: ox + (c.x - ox) * t,
    y: 0.35 + Math.sin(t * Math.PI) * 2.1,
    z: oz + (c.z - oz) * t,
    t,
  }
}

export function SmokeClouds() {
  const smokes = useAppStore((s) => s.smokes)
  const heard = useRef(new Set<string>())
  const flyDummy = useMemo(() => new THREE.Object3D(), [])
  const splatDummy = useMemo(() => new THREE.Object3D(), [])
  const flies = useRef<THREE.InstancedMesh>(null)
  const splats = useRef<THREE.InstancedMesh>(null)

  const cloudMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#6a9a4a', transparent: true, opacity: 0.34, depthWrite: false }),
    [],
  )
  const stainMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#4a2c14', transparent: true, opacity: 0.45, depthWrite: false }),
    [],
  )

  useFrame(({ clock }) => {
    const now = Date.now()
    const live = smokes.filter((c) => c.until > now)
    if (live.length !== smokes.length) useAppStore.getState().setSmokes(live)
    const t = clock.elapsedTime
    let fi = 0
    let si = 0
    const flyMesh = flies.current
    const splatMesh = splats.current
    for (const c of live) {
      if (!heard.current.has(c.id)) {
        heard.current.add(c.id)
        playSfx('poop')
      }
      const p = poopPos(c, now)
      const landed = p.t >= 1
      const nFly = isMobileDevice() ? 3 : 5
      for (let i = 0; i < nFly && flyMesh; i++) {
        const a = t * 3.4 + i * 1.7 + c.x
        flyDummy.position.set(p.x + Math.cos(a) * 0.28, p.y + 0.18 + Math.sin(a * 1.6) * 0.1, p.z + Math.sin(a) * 0.28)
        flyDummy.scale.setScalar(0.035)
        flyDummy.updateMatrix()
        flyMesh.setMatrixAt(fi++, flyDummy.matrix)
      }
      if (landed && splatMesh) {
        for (let i = 0; i < (isMobileDevice() ? 6 : 10); i++) {
          const a = i * 0.7
          splatDummy.position.set(c.x + Math.cos(a) * 0.22, 0.06 + (i % 3) * 0.05, c.z + Math.sin(a) * 0.22)
          splatDummy.scale.setScalar(0.07)
          splatDummy.updateMatrix()
          splatMesh.setMatrixAt(si++, splatDummy.matrix)
        }
      }
    }
    if (flyMesh) {
      flyMesh.count = fi
      flyMesh.instanceMatrix.needsUpdate = true
    }
    if (splatMesh) {
      splatMesh.count = si
      splatMesh.instanceMatrix.needsUpdate = true
    }
  })

  const now = Date.now()
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
      {smokes
        .filter((c) => c.until > now)
        .map((c) => {
          const p = poopPos(c, now)
          const life = Math.max(0, (c.until - now) / 8000)
          return (
            <group key={c.id}>
              {p.t < 1 ? (
                <mesh position={[p.x, p.y, p.z]}>
                  <sphereGeometry args={[0.16, 8, 6]} />
                  <meshStandardMaterial color="#6b3a18" roughness={0.9} />
                </mesh>
              ) : (
                <>
                  <mesh position={[c.x, 0.04, c.z]} rotation-x={-Math.PI / 2} material={stainMat}>
                    <circleGeometry args={[0.55 * life + 0.25, 12]} />
                  </mesh>
                  <mesh position={[c.x, 1.05, c.z]} material={cloudMat}>
                    <sphereGeometry args={[c.r * 0.72, 12, 10]} />
                  </mesh>
                </>
              )}
            </group>
          )
        })}
    </group>
  )
}
