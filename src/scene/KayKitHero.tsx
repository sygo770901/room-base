import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { PLAYER_CLASS, type ClassId } from '../../shared/classes'

const ROOT = '/assets/kaykit/adventurers'
const CHAR: Record<ClassId, string> = {
  knight: `${ROOT}/Knight.glb`,
  barbarian: `${ROOT}/Barbarian.glb`,
  rogue: `${ROOT}/Rogue.glb`,
  mage: `${ROOT}/Mage.glb`,
  ranger: `${ROOT}/Ranger.glb`,
}
const MOVE_URL = `${ROOT}/Rig_Medium_MovementBasic.glb`
const GENERAL_URL = `${ROOT}/Rig_Medium_General.glb`
const COMBAT_URL = `${ROOT}/Rig_Medium_CombatMelee.glb`
const WEAPON_ROOT = `${ROOT}/weapons`

const LOADOUT: Record<ClassId, { right?: string; left?: string }> = {
  knight: { right: 'sword_1handed.gltf', left: 'shield_round.gltf' },
  barbarian: { right: 'axe_1handed.gltf' },
  rogue: { right: 'dagger.gltf' },
  mage: { right: 'staff.gltf' },
  ranger: { right: 'sword_1handed.gltf' },
}

for (const url of [...Object.values(CHAR), MOVE_URL, GENERAL_URL, COMBAT_URL]) {
  useGLTF.preload(url)
}
for (const load of Object.values(LOADOUT)) {
  if (load.right) useGLTF.preload(`${WEAPON_ROOT}/${load.right}`)
  if (load.left) useGLTF.preload(`${WEAPON_ROOT}/${load.left}`)
}

function clipOf(gltf: { animations: THREE.AnimationClip[] }, name: string) {
  return THREE.AnimationClip.findByName(gltf.animations, name)
}

function findBone(root: THREE.Object3D, name: string) {
  let found: THREE.Object3D | undefined
  root.traverse((o) => {
    if (found) return
    if (o.name === name) {
      found = o
      return
    }
    const skinned = o as THREE.SkinnedMesh
    if (!skinned.isSkinnedMesh || !skinned.skeleton) return
    const bone = skinned.skeleton.bones.find((b) => b.name === name)
    if (bone) found = bone
  })
  return found
}

function prepareHeld(src: THREE.Object3D) {
  const mesh = src.clone(true)
  mesh.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.visible = true
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    m.renderOrder = 2
    const srcMats = Array.isArray(m.material) ? m.material : [m.material]
    const clonedMats = srcMats.map((mat) => {
      if (!mat) return mat
      const next = mat.clone()
      next.transparent = false
      next.opacity = 1
      next.depthWrite = true
      next.side = THREE.DoubleSide
      next.needsUpdate = true
      return next
    })
    m.material = clonedMats.length === 1 ? clonedMats[0] : clonedMats
  })
  return mesh
}

function countMeshes(obj: THREE.Object3D) {
  let n = 0
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n += 1
  })
  return n
}

function makeFallbackWeapon(kind: 'sword' | 'axe' | 'dagger' | 'staff' | 'shield') {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#e8eef4', metalness: 0.72, roughness: 0.22 })
  const leather = new THREE.MeshStandardMaterial({ color: '#6b3f2a', roughness: 0.7 })
  const gold = new THREE.MeshStandardMaterial({ color: '#d4b44a', metalness: 0.5, roughness: 0.4 })
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.65 })
  if (kind === 'shield') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), steel)
    disc.rotation.x = Math.PI / 2
    g.add(disc)
  } else if (kind === 'axe') {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 8), wood)
    grip.position.y = 0.2
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.06), steel)
    head.position.set(0.12, 0.52, 0)
    g.add(grip, head)
  } else if (kind === 'dagger') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.02), steel)
    blade.position.y = 0.26
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.05), gold)
    g.add(blade, guard)
  } else if (kind === 'staff') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.35, 8), wood)
    pole.position.y = 0.35
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), gold)
    gem.position.y = 1.05
    g.add(pole, gem)
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.028), steel)
    blade.position.y = 0.5
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.07), gold)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.16, 8), leather)
    grip.position.y = -0.1
    g.add(blade, guard, grip)
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.frustumCulled = false
    }
  })
  return g
}

const FALLBACK: Record<ClassId, { right: 'sword' | 'axe' | 'dagger' | 'staff'; left?: 'shield' }> = {
  knight: { right: 'sword', left: 'shield' },
  barbarian: { right: 'axe' },
  rogue: { right: 'dagger' },
  mage: { right: 'staff' },
  ranger: { right: 'sword' },
}

export function KayKitHero({
  classId,
  moving,
  running,
  attackAt,
  seated,
  hidden,
  compact,
}: {
  classId: ClassId
  moving: boolean
  running?: boolean
  attackAt: number
  seated?: boolean
  hidden?: boolean
  compact?: boolean
}) {
  const char = useGLTF(CHAR[classId])
  const moveGltf = useGLTF(MOVE_URL)
  const generalGltf = useGLTF(GENERAL_URL)
  const combatGltf = useGLTF(COMBAT_URL)
  const load = LOADOUT[classId]
  const rightGltf = useGLTF(load.right ? `${WEAPON_ROOT}/${load.right}` : MOVE_URL)
  const leftGltf = useGLTF(load.left ? `${WEAPON_ROOT}/${load.left}` : MOVE_URL)

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

  const rightWeapon = useMemo(() => {
    const g = new THREE.Group()
    g.name = 'held-right'
    if (load.right) {
      const cloned = prepareHeld(rightGltf.scene)
      if (countMeshes(cloned)) g.add(cloned)
    }
    if (!g.children.length) g.add(makeFallbackWeapon(FALLBACK[classId].right))
    return g
  }, [classId, load.right, rightGltf.scene])

  const leftWeapon = useMemo(() => {
    const g = new THREE.Group()
    g.name = 'held-left'
    if (load.left) {
      const cloned = prepareHeld(leftGltf.scene)
      if (countMeshes(cloned)) g.add(cloned)
    }
    if (!g.children.length && FALLBACK[classId].left) g.add(makeFallbackWeapon(FALLBACK[classId].left))
    return g
  }, [classId, load.left, leftGltf.scene])

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

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    const rightBone = findBone(root, 'handslot.r')
    const leftBone = findBone(root, 'handslot.l')
    const mount = (bone: THREE.Object3D | undefined, held: THREE.Object3D) => {
      if (!bone || !held.children.length) return
      bone.add(held)
      held.position.set(0, 0, 0)
      held.rotation.set(0, 0, 0)
      held.scale.setScalar(1)
      held.updateMatrix()
    }
    mount(rightBone, rightWeapon)
    mount(leftBone, leftWeapon)
    return () => {
      rightWeapon.removeFromParent()
      leftWeapon.removeFromParent()
    }
  }, [root, rightWeapon, leftWeapon])

  const s = (compact ? 0.86 : 1) * (hidden ? 0.72 : 1)

  return (
    <group scale={s}>
      <primitive object={root} />
    </group>
  )
}

export { PLAYER_CLASS }
