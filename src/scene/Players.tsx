import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { PLAYER_CLASS } from '../../shared/classes'
import { heightFieldOf } from '../../shared/heightmaps'
import { useAppStore } from '../store'
import type { PlayerState } from '../types'
import { KayKitHero } from './KayKitHero'
import { StuckMark } from './PoopAim'
import { playerMotion } from './playerMotion'
import { livePose } from './livePose'
import { ModelBoundary } from './ModelBoundary'

type Gait = 'idle' | 'walk' | 'run'

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

export function Avatar({ player, isSelf }: { player: PlayerState; isSelf?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const speed = useRef(0)
  const ready = useRef(false)
  const moveSample = useRef({ x: 0, z: 0, t: 0, speed: 0, stillAt: 0, ready: false })
  const [gait, setGait] = useState<Gait>('idle')
  const gaitNow = useRef<Gait>('idle')
  const motion = useRef({ moving: false, running: false })
  const swingAt = useAppStore((s) => s.swings[player.id] ?? 0)
  const combo = useAppStore((s) => s.swingCombo[player.id] ?? 0)
  const hit = useAppStore((s) => s.hitAnim[player.id])
  const storedJump = useAppStore((s) => s.jumpPhase[player.id] ?? null)
  const y = player.position?.[1] ?? 0
  const jumpPhase = storedJump ?? (y > 0.4 ? 'idle' : y > 0.12 ? 'start' : null)
  const dashUntil = useAppStore((s) => s.dashUntil[player.id] ?? 0)
  const hurtUntil = useAppStore((s) => s.hurtFlashUntil[player.id] ?? 0)
  const throwAt = useAppStore((s) => s.throwAt[player.id] ?? 0)

  const sampleSpeed = (x: number, z: number) => {
    const now = performance.now()
    const s = moveSample.current
    if (!s.ready) {
      s.ready = true
      s.x = x
      s.z = z
      s.t = now
      return 0
    }
    const dist = Math.hypot(x - s.x, z - s.z)
    if (dist > 0.01) {
      const dt = Math.max((now - s.t) / 1000, 1 / 120)
      s.speed = dist / dt
      s.x = x
      s.z = z
      s.t = now
      s.stillAt = 0
    } else if (s.stillAt === 0) {
      s.stillAt = now
    } else if (now - s.stillAt > 160) {
      s.speed = 0
    }
    return s.speed
  }

  const publishSpeed = (spd: number) => {
    const next: Gait = player.seated || spd <= 0.28 ? 'idle' : spd > 3.6 ? 'run' : 'walk'
    motion.current.moving = next !== 'idle'
    motion.current.running = next === 'run'
    playerMotion.set(player.id, motion.current)
    if (gaitNow.current !== next) {
      gaitNow.current = next
      try {
        flushSync(() => setGait(next))
      } catch (err) {
        const slot = window as Window & { __flushErr?: string }
        slot.__flushErr = err instanceof Error ? err.message : String(err)
      }
    }
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const slot = window as Window & {
        __gaits?: Record<string, { gait: Gait; speed: number; self: boolean }>
      }
      const map = slot.__gaits ?? {}
      map[player.id] = { gait: next, speed: spd, self: Boolean(isSelf) }
      slot.__gaits = map
    }
  }

  useFrame((_, dt) => {
    const g = group.current
    const p = player.position
    if (!g || !p) return
    const nav = heightFieldOf(useAppStore.getState().scene)
    const selfLive = Boolean(isSelf && livePose.ready)
    const px = selfLive ? livePose.x : p[0]
    const py = selfLive ? livePose.y : (p[1] ?? 0)
    const pz = selfLive ? livePose.z : p[2]
    const yaw = selfLive ? livePose.yaw : player.rotationY
    // 受傷閃爍會把整個人藏起來。高度圖上自己這一幀要留在畫面左下，不能跟著閃沒。
    const blink = hurtUntil > Date.now() && !(isSelf && nav)
    if (blink) {
      g.visible = Math.floor(Date.now() / 80) % 2 === 0
    } else if (!g.visible) {
      g.visible = true
    }
    const step = Math.max(dt, 1 / 120)
    if (isSelf || !ready.current) {
      const prevX = g.position.x
      const prevZ = g.position.z
      const ny = isSelf && nav && ready.current ? THREE.MathUtils.damp(g.position.y, py, 12, dt) : py
      g.position.set(px, ny, pz)
      g.rotation.y = yaw
      speed.current = isSelf && ready.current ? Math.hypot(px - prevX, pz - prevZ) / step : 0
      ready.current = true
      publishSpeed(speed.current)
      return
    }
    const live = useAppStore.getState().players[player.id]
    const remoteLoco = live?.loco
    if (remoteLoco) {
      const tx = live?.position?.[0] ?? p[0]
      const ty = live?.position?.[1] ?? py
      const tz = live?.position?.[2] ?? p[2]
      const gap = Math.hypot(tx - g.position.x, tz - g.position.z)
      if (gap > 8) g.position.set(tx, ty, tz)
      else {
        g.position.x = THREE.MathUtils.damp(g.position.x, tx, 14, dt)
        g.position.y = THREE.MathUtils.damp(g.position.y, ty, 18, dt)
        g.position.z = THREE.MathUtils.damp(g.position.z, tz, 14, dt)
      }
      g.rotation.y = dampAngle(g.rotation.y, live?.rotationY ?? player.rotationY, 16, dt)
      speed.current = remoteLoco === 'run' ? 5.2 : remoteLoco === 'walk' ? 1.4 : 0
      const next: Gait = remoteLoco
      motion.current.moving = next !== 'idle'
      motion.current.running = next === 'run'
      playerMotion.set(player.id, motion.current)
      if (gaitNow.current !== next) {
        gaitNow.current = next
        try {
          flushSync(() => setGait(next))
        } catch (err) {
          const slot = window as Window & { __flushErr?: string }
          slot.__flushErr = err instanceof Error ? err.message : String(err)
        }
      }
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        const slot = window as Window & {
          __gaits?: Record<string, { gait: Gait; speed: number; self: boolean }>
        }
        const map = slot.__gaits ?? {}
        map[player.id] = { gait: next, speed: speed.current, self: false }
        slot.__gaits = map
      }
      return
    }
    const dist = Math.hypot(p[0] - g.position.x, p[2] - g.position.z)
    if (dist > 8) {
      g.position.set(p[0], py, p[2])
      g.rotation.y = player.rotationY
      moveSample.current = { x: p[0], z: p[2], t: performance.now(), speed: 0, stillAt: performance.now(), ready: true }
      speed.current = 0
      publishSpeed(0)
      return
    }
    const nx = THREE.MathUtils.damp(g.position.x, p[0], 14, dt)
    const ny = THREE.MathUtils.damp(g.position.y, py, 18, dt)
    const nz = THREE.MathUtils.damp(g.position.z, p[2], 14, dt)
    speed.current = sampleSpeed(p[0], p[2])
    g.position.x = nx
    g.position.y = ny
    g.position.z = nz
    g.rotation.y = dampAngle(g.rotation.y, player.rotationY, 16, dt)
    publishSpeed(speed.current)
  })

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const slot = window as Window & { __gaitState?: Record<string, Gait> }
    const map = slot.__gaitState ?? {}
    map[player.id] = gait
    slot.__gaitState = map
  }
  const moving = gait !== 'idle'
  const running = gait === 'run'
  const labelY = player.hidden ? 1.15 : 1.95
  const whiteFlash = hurtUntil > Date.now() && hurtUntil - Date.now() > 500

  return (
    <group ref={group}>
      {player.away && (
        <mesh position={[0, 0.95, 0]}>
          <capsuleGeometry args={[0.48, 1.15, 4, 8]} />
          <meshBasicMaterial color="#8aa0c8" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      )}
      {whiteFlash && (
        <mesh position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.55, 10, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.34, 0.5, 22]} />
        <meshBasicMaterial color={player.color} transparent opacity={0.82} depthWrite={false} />
      </mesh>
      <StuckMark id={player.id} />
      <KayKitHero
        classId={PLAYER_CLASS}
        debugId={player.id}
        motion={motion}
        moving={moving}
        running={running}
        dashUntil={dashUntil}
        attackAt={swingAt}
        combo={combo}
        hitAt={hit?.at ?? 0}
        hitKind={hit?.kind}
        jumpPhase={jumpPhase}
        heldWeapon={
          player.weapon && (player.weaponUntil ?? 0) > Date.now() ? player.weapon : 'sword'
        }
        seated={Boolean(player.seated)}
        hidden={player.hidden}
        throwAt={throwAt}
        downed={Boolean(player.downedUntil && player.downedUntil > Date.now()) || player.hp <= 0}
      />
      {player.phrase && player.phrase.until > Date.now() && (
        <Billboard position={[0, labelY + 0.32, 0]}>
          <Text
            fontSize={0.2}
            color="#fff4d6"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#1a1208"
          >
            {player.phrase.text}
          </Text>
        </Billboard>
      )}
      {!isSelf && (
        <Billboard position={[0, labelY, 0]}>
          <Text
            fontSize={0.16}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#000000"
          >
            {player.away ? '斷線中' : player.downedUntil && player.downedUntil > Date.now() ? `${player.name} · 倒地` : player.name}
            {player.away ? '' : player.role === 'host' ? ' · 房主' : ''}
            {player.hidden && !player.away ? ' · 躲藏' : ''}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export function RemotePlayers({
  players,
  selfId,
}: {
  players: Record<string, PlayerState>
  selfId: string | null
}) {
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId && p.position)
        .map((p) => (
          <Avatar key={p.id} player={p} />
        ))}
    </>
  )
}

export function LocalAvatar({ player }: { player: PlayerState }) {
  return (
    <ModelBoundary file="/assets/kaykit/adventurers/Ranger.glb" fallback={null}>
      <Avatar player={player} isSelf />
    </ModelBoundary>
  )
}
