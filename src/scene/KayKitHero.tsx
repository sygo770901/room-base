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
    const skinned = o as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh && skinned.skeleton) {
      const bone = skinned.skeleton.bones.find((b) => b.name === name)
      if (bone) found = bone
    }
    if (o.name === name) found = o
  })
  return found
}

function cloneWeapon(src: THREE.Object3D) {
  const mesh = src.clone(true)
  mesh.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    if (m.material) m.material = (m.material as THREE.Material).clone()
  })
  return mesh
}

function makeHeldSword() {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#e8eef4', metalness: 0.7, roughness: 0.22 })
  const leather = new THREE.MeshStandardMaterial({ color: '#6b3f2a', roughness: 0.7 })
  const gold = new THREE.MeshStandardMaterial({ color: '#d4b44a', metalness: 0.5, roughness: 0.4 })
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.12, 0.03), steel)
  blade.position.y = 0.58
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.08), gold)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.2, 8), leather)
  grip.position.y = -0.12
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), gold)
  pommel.position.y = -0.24
  g.add(blade, guard, grip, pommel)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.frustumCulled = false
    }
  })
  return g
}

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _parentQuat = new THREE.Quaternion()

function snapToBone(obj: THREE.Object3D, bone: THREE.Object3D) {
  const parent = obj.parent
  if (!parent) return
  bone.updateWorldMatrix(true, false)
  bone.getWorldPosition(_worldPos)
  parent.worldToLocal(_worldPos)
  obj.position.copy(_worldPos)
  bone.getWorldQuaternion(_worldQuat)
  parent.getWorldQuaternion(_parentQuat)
  obj.quaternion.copy(_parentQuat.invert().multiply(_worldQuat))
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
  const rightRef = useRef<THREE.Group>(null)
  const leftRef = useRef<THREE.Group>(null)

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
    g.add(makeHeldSword())
    if (load.right) {
      const kaykit = cloneWeapon(rightGltf.scene)
      kaykit.rotation.set(0, 0, 0)
      kaykit.scale.setScalar(1.05)
      g.add(kaykit)
    }
    return g
  }, [load.right, rightGltf.scene])

  const leftWeapon = useMemo(() => {
    const g = new THREE.Group()
    if (load.left) g.add(cloneWeapon(leftGltf.scene))
    return g
  }, [load.left, leftGltf.scene])

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
    const right = findBone(root, 'handslot.r') ?? findBone(root, 'hand.r')
    const left = findBone(root, 'handslot.l') ?? findBone(root, 'hand.l')
    if (right && rightRef.current) snapToBone(rightRef.current, right)
    if (left && leftRef.current) snapToBone(leftRef.current, left)
  })

  const s = (compact ? 0.86 : 1) * (hidden ? 0.72 : 1)

  return (
    <group scale={s}>
      <primitive object={root} />
      {load.right && (
        <group ref={rightRef} position={[0.46, 0.82, 0.14]}>
          <group rotation={[Math.PI / 2, 0, 0.15]}>
            <primitive object={rightWeapon} />
          </group>
        </group>
      )}
      {load.left && (
        <group ref={leftRef} position={[-0.34, 0.74, 0.1]}>
          <primitive object={leftWeapon} />
        </group>
      )}
    </group>
  )
}

export { PLAYER_CLASS }
