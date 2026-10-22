import { DISPENSER_MIN_SPACING } from '../shared/combat.ts'
import {
  clampDispenserStep,
  dispenserPairDistance,
  placeDispensers,
  relaxDispenserSpacing,
} from '../shared/dispensers.ts'
import { SCENE_IDS } from '../shared/scenes.ts'

const seeds = [1, 2, 7, 11, 42]

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

for (const scene of SCENE_IDS) {
  for (const seed of seeds) {
    const spawned = placeDispensers(scene, 5, seed)
    assert(spawned.length === 5, `${scene} seed ${seed} 只找到 ${spawned.length} 個落點`)
    const gap = dispenserPairDistance(spawned)
    assert(gap >= DISPENSER_MIN_SPACING - 1e-6, `${scene} seed ${seed} 生成間距 ${gap.toFixed(3)} < ${DISPENSER_MIN_SPACING}`)

    const near = spawned[0]
    const around = placeDispensers(scene, 4, seed + 99, near, [near])
    assert(around.length === 4, `${scene} 在既有飲水機旁只放了 ${around.length} 台`)
    const packed = dispenserPairDistance([...around, near])
    assert(packed >= DISPENSER_MIN_SPACING - 1e-6, `${scene} 加開的飲水機間距 ${packed.toFixed(3)}`)

    const piled = Array.from({ length: 4 }, () => ({ x: near.x, z: near.z }))
    const relaxed = relaxDispenserSpacing(piled)
    const spread = dispenserPairDistance(relaxed)
    assert(spread >= DISPENSER_MIN_SPACING - 1e-4, `${scene} seed ${seed} 推開後仍重疊 ${spread.toFixed(3)}`)
    let wandered = 0
    for (const p of relaxed) wandered = Math.max(wandered, Math.hypot(p.x - near.x, p.z - near.z))
    assert(wandered < DISPENSER_MIN_SPACING * 4, `${scene} seed ${seed} 疊點被推到 ${wandered.toFixed(1)} 公尺外`)

    const held = clampDispenserStep(near.x, near.z, around[0].x, around[0].z, [around[0]])
    const stepGap = Math.hypot(held.x - around[0].x, held.z - around[0].z)
    assert(stepGap >= DISPENSER_MIN_SPACING - 1e-3, `${scene} 移動後靠到 ${stepGap.toFixed(3)}`)
  }
}

console.log('dispenser-spacing: ok', { maps: SCENE_IDS.length, seeds: seeds.length, min: DISPENSER_MIN_SPACING })
