import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { PLAYER_CLASS, type ClassId } from '../../shared/classes'
import type { HeldWeapon } from '../../shared/barrels'
import { COMBO_CLIP_NAMES, deathAnimTrigger, type HitAnim, type JumpPhase } from '../../shared/anim'

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

export function heroModelUrls() {
  const weapons: string[] = []
  for (const load of Object.values(LOADOUT)) {
    if (load.right) weapons.push(`${WEAPON_ROOT}/${load.right}`)
    if (load.left) weapons.push(`${WEAPON_ROOT}/${load.left}`)
  }
  return [...Object.values(CHAR), MOVE_URL, GENERAL_URL, COMBAT_URL, ...new Set(weapons)]
}

for (const url of heroModelUrls()) useGLTF.preload(url)

function clipOf(gltf: { animations: THREE.AnimationClip[] }, name: string) {
  return THREE.AnimationClip.findByName(gltf.animations, name)
}

const normBone = (s: string) => s.toLowerCase().replace(/[.\s_:\/\[\]]/g, '')

function gripBone(root: THREE.Object3D, side: 'r' | 'l') {
  const found: THREE.Object3D[] = []
  const consider = (o: THREE.Object3D) => {
    const n = o.name.toLowerCase().replace(/[.\s_:]/g, '')
    if (!n.includes('hand') || !n.endsWith(side)) return
    found.push(o)
  }
  root.traverse((o) => {
    consider(o)
    const skinned = o as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh && skinned.skeleton) skinned.skeleton.bones.forEach(consider)
  })
  const unique: THREE.Object3D[] = []
  for (const bone of found) {
    if (!unique.includes(bone)) unique.push(bone)
  }
  return unique.find((o) => o.name.toLowerCase().includes('slot')) ?? unique[0]
}

function findBone(root: THREE.Object3D, name: string) {
  const want = normBone(name)
  let found: THREE.Object3D | undefined
  root.traverse((o) => {
    if (found) return
    if (normBone(o.name) === want) {
      found = o
      return
    }
    const skinned = o as THREE.SkinnedMesh
    if (!skinned.isSkinnedMesh || !skinned.skeleton) return
    const bone = skinned.skeleton.bones.find((b) => normBone(b.name) === want)
    if (bone) found = bone
  })
  return found
}

function handBones(root: THREE.Object3D) {
  const names: string[] = []
  root.traverse((o) => {
    if (/hand/i.test(o.name)) names.push(o.name)
    const skinned = o as THREE.SkinnedMesh
    if (!skinned.isSkinnedMesh || !skinned.skeleton) return
    for (const b of skinned.skeleton.bones) {
      if (/hand/i.test(b.name)) names.push(b.name)
    }
  })
  return [...new Set(names)]
}

/** 劍刃沿模型最長軸。轉成局部 +Y，手槽的 +Y 在待機與揮擊時朝角色前方。 */
function orientBladeToPlusY(root: THREE.Object3D) {
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  let axis: 'x' | 'y' | 'z' = 'y'
  if (size.x > size[axis]) axis = 'x'
  if (size.z > size[axis]) axis = 'z'
  const tipIsMax = Math.abs(box.max[axis]) >= Math.abs(box.min[axis])
  if (axis === 'y' && tipIsMax) return
  if (axis === 'y') root.rotation.x = Math.PI
  else if (axis === 'z') root.rotation.x = tipIsMax ? -Math.PI / 2 : Math.PI / 2
  else root.rotation.z = tipIsMax ? Math.PI / 2 : -Math.PI / 2
  root.updateMatrixWorld(true)
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

function once(action: THREE.AnimationAction | null) {
  if (!action) return null
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  return action
}

export function KayKitHero({
  classId,
  moving,
  running,
  dashing,
  dashUntil,
  attackAt,
  combo = 0,
  hitAt = 0,
  hitKind,
  jumpPhase = null,
  seated,
  hidden,
  compact,
  heldWeapon,
  throwAt = 0,
  downed,
}: {
  classId: ClassId
  moving: boolean
  running?: boolean
  dashing?: boolean
  dashUntil?: number
  attackAt: number
  combo?: number
  hitAt?: number
  hitKind?: HitAnim
  jumpPhase?: JumpPhase | null
  seated?: boolean
  hidden?: boolean
  compact?: boolean
  heldWeapon?: HeldWeapon
  throwAt?: number
  downed?: boolean
}) {
  const char = useGLTF(CHAR[classId])
  const moveGltf = useGLTF(MOVE_URL)
  const generalGltf = useGLTF(GENERAL_URL)
  const combatGltf = useGLTF(COMBAT_URL)
  const load = LOADOUT[classId]
  const held = heldWeapon === 'dagger' ? 'dagger.gltf' : heldWeapon === 'hammer' ? 'axe_1handed.gltf' : load.right
  const rightGltf = useGLTF(held ? `${WEAPON_ROOT}/${held}` : MOVE_URL)
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
    if (held) {
      const cloned = prepareHeld(rightGltf.scene)
      if (countMeshes(cloned)) g.add(cloned)
    }
    if (!g.children.length) {
      const kind = heldWeapon === 'dagger' ? 'dagger' : heldWeapon === 'hammer' ? 'axe' : FALLBACK[classId].right
      g.add(makeFallbackWeapon(kind))
    }
    return g
  }, [classId, held, heldWeapon, rightGltf.scene])

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
    const idle = clipOf(generalGltf, 'Idle_A') ? mixer.clipAction(clipOf(generalGltf, 'Idle_A')!) : null
    const walk = clipOf(moveGltf, 'Walking_A') ? mixer.clipAction(clipOf(moveGltf, 'Walking_A')!) : null
    const run = clipOf(moveGltf, 'Running_A') ? mixer.clipAction(clipOf(moveGltf, 'Running_A')!) : null
    const dashClip = clipOf(moveGltf, 'Running_B')
    const dash = dashClip ? mixer.clipAction(dashClip) : run
    const combo = COMBO_CLIP_NAMES.map((name) => once(clipOf(combatGltf, name) ? mixer.clipAction(clipOf(combatGltf, name)!) : null))
    const hitA = once(clipOf(generalGltf, 'Hit_A') ? mixer.clipAction(clipOf(generalGltf, 'Hit_A')!) : null)
    const hitB = once(clipOf(generalGltf, 'Hit_B') ? mixer.clipAction(clipOf(generalGltf, 'Hit_B')!) : null)
    const death = once(clipOf(generalGltf, 'Death_A') ? mixer.clipAction(clipOf(generalGltf, 'Death_A')!) : null)
    const jumpStart = once(clipOf(moveGltf, 'Jump_Start') ? mixer.clipAction(clipOf(moveGltf, 'Jump_Start')!) : null)
    const jumpIdle = clipOf(moveGltf, 'Jump_Idle') ? mixer.clipAction(clipOf(moveGltf, 'Jump_Idle')!) : null
    const jumpLand = once(clipOf(moveGltf, 'Jump_Land') ? mixer.clipAction(clipOf(moveGltf, 'Jump_Land')!) : null)
    idle?.setLoop(THREE.LoopRepeat, Infinity)
    walk?.setLoop(THREE.LoopRepeat, Infinity)
    run?.setLoop(THREE.LoopRepeat, Infinity)
    dash?.setLoop(THREE.LoopRepeat, Infinity)
    jumpIdle?.setLoop(THREE.LoopRepeat, Infinity)
    return { idle, walk, run, dash, combo, hitA, hitB, death, jumpStart, jumpIdle, jumpLand }
  }, [mixer, moveGltf, generalGltf, combatGltf])
  const current = useRef<THREE.AnimationAction | null>(null)
  const lastAttack = useRef(0)
  const lastHit = useRef(0)
  const lastThrow = useRef(0)
  const lastJump = useRef<JumpPhase | null>(null)
  const wasDowned = useRef(false)
  const locoRef = useRef({ moving, running, dashing, dashUntil, seated, jumpPhase })
  locoRef.current = { moving, running, dashing, dashUntil, seated, jumpPhase }

  const play = (next: THREE.AnimationAction | null, fade = 0.12) => {
    if (!next) return
    if (current.current === next && next.isRunning()) return
    current.current?.fadeOut(fade)
    next.reset().fadeIn(fade).play()
    current.current = next
  }

  const loco = () => {
    const s = locoRef.current
    const dashOn = Boolean(s.dashing) || (s.dashUntil ?? 0) > Date.now()
    if (s.seated) return actions.idle
    if (dashOn) return actions.dash ?? actions.run
    if (s.moving) return s.running ? actions.run : actions.walk
    return actions.idle
  }

  const oneshot = () => {
    const cur = current.current
    if (!cur) return false
    const list = [
      ...actions.combo,
      actions.hitA,
      actions.hitB,
      actions.death,
      actions.jumpStart,
      actions.jumpLand,
    ]
    return list.includes(cur) && cur.isRunning()
  }

  useLayoutEffect(() => {
    const onDone = (e: { action: THREE.AnimationAction }) => {
      const act = e.action
      if (act === actions.jumpStart) {
        const phase = locoRef.current.jumpPhase
        play(phase === 'land' ? actions.jumpLand : actions.jumpIdle ?? loco(), 0.08)
        return
      }
      if (act === actions.death) return
      if (act === actions.jumpLand || act === actions.hitA || act === actions.hitB || actions.combo.includes(act)) {
        play(loco(), 0.12)
      }
    }
    mixer.addEventListener('finished', onDone)
    return () => mixer.removeEventListener('finished', onDone)
  }, [mixer, actions])

  useLayoutEffect(
    () => () => {
      mixer.stopAllAction()
    },
    [mixer],
  )

  useFrame((_, dt) => {
    const phase = deathAnimTrigger(wasDowned.current, Boolean(downed))
    wasDowned.current = Boolean(downed)
    if (phase === 'play' && actions.death) {
      actions.death.setLoop(THREE.LoopOnce, 1)
      actions.death.clampWhenFinished = true
      current.current?.fadeOut(0.06)
      actions.death.reset().fadeIn(0.06).play()
      current.current = actions.death
      mixer.update(dt)
      return
    }
    if (phase === 'hold') {
      mixer.update(dt)
      return
    }
    if (phase === 'idle') {
      play(actions.idle ?? loco(), 0.16)
    }
    if (hitAt > lastHit.current && hitKind) {
      lastHit.current = hitAt
      if (hitKind === 'death') play(actions.death, 0.05)
      else play(hitKind === 'B' ? actions.hitB ?? actions.hitA : actions.hitA ?? actions.hitB, 0.05)
    } else if (throwAt > lastThrow.current) {
      lastThrow.current = throwAt
      play(actions.combo[1] ?? actions.combo[0], 0.05)
    } else if (attackAt > lastAttack.current) {
      lastAttack.current = attackAt
      const clip = actions.combo[combo] ?? actions.combo[0]
      play(clip, 0.05)
    } else if (jumpPhase && jumpPhase !== lastJump.current) {
      lastJump.current = jumpPhase
      if (jumpPhase === 'start') play(actions.jumpStart ?? actions.jumpIdle, 0.06)
      else if (jumpPhase === 'idle') play(actions.jumpIdle ?? actions.jumpStart, 0.08)
      else play(actions.jumpLand ?? loco(), 0.06)
    } else if (!oneshot()) {
      if (jumpPhase === 'idle') play(actions.jumpIdle ?? loco(), 0.1)
      else if (jumpPhase === 'start' && current.current === actions.jumpStart) {
        /* keep start until finished */
      } else {
        const next = loco()
        if (next && current.current !== next) play(next, 0.16)
        else if (next && !next.isRunning()) {
          next.play()
          current.current = next
        }
      }
    }
    mixer.update(dt)
  })

  useLayoutEffect(() => {
    const rightBone = gripBone(root, 'r')
    const leftBone = gripBone(root, 'l')
    const mount = (bone: THREE.Object3D | undefined, held: THREE.Object3D, label: string) => {
      if (!held.children.length) return
      if (!bone) {
        console.warn(`[weapon] 找不到 ${label}`, handBones(root))
        return
      }
      held.position.set(0, 0, 0)
      held.rotation.set(0, 0, 0)
      held.scale.setScalar(1)
      if (label === 'handslot.r') orientBladeToPlusY(held)
      bone.add(held)
      held.updateMatrix()
      root.updateMatrixWorld(true)
      bone.updateWorldMatrix(true, true)
      const world = new THREE.Vector3()
      const scale = new THREE.Vector3()
      held.getWorldPosition(world)
      held.getWorldScale(scale)
      const sl = scale.length() / Math.sqrt(3)
      if (sl < 0.01 || sl > 100) {
        const fix = 1 / Math.max(sl, 1e-6)
        held.scale.setScalar(fix)
        held.updateMatrix()
        root.updateMatrixWorld(true)
        held.getWorldPosition(world)
        held.getWorldScale(scale)
      }
      if (label === 'handslot.r') {
        const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(held.getWorldQuaternion(new THREE.Quaternion()))
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))
        tip.y = 0
        fwd.y = 0
        if (tip.lengthSq() > 1e-4 && fwd.lengthSq() > 1e-4 && tip.normalize().dot(fwd.normalize()) < 0) {
          held.rotateX(Math.PI)
          held.updateMatrix()
        }
      }
      console.log(`[weapon] bone=${bone.name} pos=${world.x.toFixed(2)},${world.y.toFixed(2)},${world.z.toFixed(2)} scale=${scale.x.toFixed(3)}`)
    }
    mount(rightBone, rightWeapon, 'handslot.r')
    mount(leftBone, leftWeapon, 'handslot.l')
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
