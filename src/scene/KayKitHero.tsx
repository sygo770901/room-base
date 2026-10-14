import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import type { ClassId } from '../../shared/classes'

const ROOT = '/assets/kaykit/adventurers'
const CHAR: Record<ClassId, string> = {
  knight: `${ROOT}/Knight.glb`,
  barbarian: `${ROOT}/Barbarian.glb`,
  rogue: `${ROOT}/Rogue.glb`,
  mage: `${ROOT}/Mage.glb`,
}
const MOVE_URL = `${ROOT}/Rig_Medium_MovementBasic.glb`
const GENERAL_URL = `${ROOT}/Rig_Medium_General.glb`
const COMBAT_URL = `${ROOT}/Rig_Medium_CombatMelee.glb`

for (const url of [...Object.values(CHAR), MOVE_URL, GENERAL_URL, COMBAT_URL]) {
  useGLTF.preload(url)
}

function clipOf(gltf: { animations: THREE.AnimationClip[] }, name: string) {
  return THREE.AnimationClip.findByName(gltf.animations, name)
}

export function KayKitHero({
  classId,
  moving,
  running,
  attackAt,
  seated,
  hidden,
}: {
  classId: ClassId
  moving: boolean
  running?: boolean
  attackAt: number
  seated?: boolean
  hidden?: boolean
}) {
  const char = useGLTF(CHAR[classId])
  const moveGltf = useGLTF(MOVE_URL)
  const generalGltf = useGLTF(GENERAL_URL)
  const combatGltf = useGLTF(COMBAT_URL)
  const root = useMemo(() => {
    const clone = cloneSkinned(char.scene) as THREE.Object3D
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return clone
  }, [char.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root])
  const actions = useMemo(() => {
    const idleClip = clipOf(generalGltf, 'Idle_A')
    const walkClip = clipOf(moveGltf, 'Walking_A')
    const runClip = clipOf(moveGltf, 'Running_A')
    const attackClip = clipOf(combatGltf, 'Melee_1H_Attack_Chop')
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const run = runClip ? mixer.clipAction(runClip) : null
    const attack = attackClip ? mixer.clipAction(attackClip) : null
    idle?.setLoop(THREE.LoopRepeat, Infinity)
    walk?.setLoop(THREE.LoopRepeat, Infinity)
    run?.setLoop(THREE.LoopRepeat, Infinity)
    if (attack) {
      attack.setLoop(THREE.LoopOnce, 1)
      attack.clampWhenFinished = true
    }
    return { idle, walk, run, attack }
  }, [mixer, moveGltf, generalGltf, combatGltf])
  const current = useRef<THREE.AnimationAction | null>(null)
  const lastAttack = useRef(0)

  useEffect(() => {
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== actions.attack) return
      const next = seated ? actions.idle : moving ? (running ? actions.run : actions.walk) : actions.idle
      if (!next) return
      e.action.fadeOut(0.12)
      next.reset().fadeIn(0.12).play()
      current.current = next
    }
    mixer.addEventListener('finished', onDone)
    return () => {
      mixer.removeEventListener('finished', onDone)
      mixer.stopAllAction()
    }
  }, [mixer, actions, moving, running, seated])

  useFrame((_, dt) => {
    if (attackAt > lastAttack.current && actions.attack) {
      lastAttack.current = attackAt
      current.current?.fadeOut(0.08)
      actions.attack.reset().fadeIn(0.05).play()
      current.current = actions.attack
    } else if (current.current !== actions.attack || !actions.attack?.isRunning()) {
      const next = seated ? actions.idle : moving ? (running ? actions.run : actions.walk) : actions.idle
      if (next && current.current !== next) {
        current.current?.fadeOut(0.16)
        next.reset().fadeIn(0.16).play()
        current.current = next
      } else if (next && !next.isRunning()) {
        next.play()
        current.current = next
      }
    }
    mixer.update(dt)
  })

  return (
    <group scale={hidden ? 0.72 : 1}>
      <primitive object={root} />
    </group>
  )
}
