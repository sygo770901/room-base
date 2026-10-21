import { BARREL_COUNT, barrelSpotsOf } from '../shared/barrels.ts'
import { SPAWN_POINTS } from '../shared/dungeon.ts'
import { doorsOf, extraWallsOf, spawnPointsOf } from '../shared/mapData.ts'
import { JUMP_CEILING, jumpCeilingFor } from '../shared/movement.ts'
import { DESKTOP_DYNAMIC_POINT_LIGHTS } from '../shared/perf.ts'
import { platformsFor } from '../shared/platforms.ts'
import { SCENE_IDS } from '../shared/scenes.ts'
import {
  SAMPLE_PLACES,
  SAMPLE_PLATFORM_Y,
  SAMPLE_PLATFORMS,
  SAMPLE_SPAWNS,
  SAMPLE_ZONES,
  samplePropCount,
  sampleWalkable,
} from '../shared/sampleRoom.ts'

if (!SCENE_IDS.includes('sample')) throw new Error('樣本地圖要能選')
if (JUMP_CEILING !== 2.6) throw new Error('既有地圖跳躍上限被改掉')
if (jumpCeilingFor('kenney') !== 2.6) throw new Error('kenney 跳躍上限應維持 2.6')
if (jumpCeilingFor('kaykit') !== 2.6) throw new Error('kaykit 跳躍上限應維持 2.6')
if (jumpCeilingFor('jungle') !== 2.6) throw new Error('jungle 跳躍上限應維持 2.6')
if (jumpCeilingFor('sample') < SAMPLE_PLATFORM_Y + 2) throw new Error('樣本要上得了高台')

if (DESKTOP_DYNAMIC_POINT_LIGHTS < 3 || DESKTOP_DYNAMIC_POINT_LIGHTS > 4) {
  throw new Error(`桌面動態點光應為 3 到 4，現在是 ${DESKTOP_DYNAMIC_POINT_LIGHTS}`)
}

if (spawnPointsOf('kenney') !== SPAWN_POINTS) throw new Error('既有地圖出生點被換掉')
if (spawnPointsOf('kaykit') !== SPAWN_POINTS) throw new Error('kaykit 應沿用原出生點')
for (const sp of SAMPLE_SPAWNS) {
  if (!sampleWalkable(sp.x, sp.z, 0.4)) throw new Error(`樣本出生點不可走 ${sp.x},${sp.z}`)
  if (sp.z < 200) throw new Error('樣本出生點不該落在舊地圖')
}

if (barrelSpotsOf('sample').length !== 0) throw new Error('樣本不該生成舊地圖木桶')
const kenneyBarrels = barrelSpotsOf('kenney')
if (kenneyBarrels.length !== BARREL_COUNT) throw new Error('kenney 木桶數量變了')
if (kenneyBarrels.some((b) => b.z > 180)) throw new Error('kenney 木桶跑出舊地圖')
if (barrelSpotsOf('kaykit').length !== kenneyBarrels.length) throw new Error('kaykit 木桶數量變了')

if (doorsOf('sample').length !== 0) throw new Error('樣本用模型門，不該再畫程序門')
if (doorsOf('future-map').length === 0) throw new Error('未知地圖仍要有預設門')
if (extraWallsOf('kenney').length !== 0) throw new Error('kenney 不該多出樣本牆')
if (extraWallsOf('kaykit').some((w) => w.cz > 200)) throw new Error('kaykit 牆跑進樣本區')

const floors = new Map<string, number>()
for (const p of SAMPLE_PLACES) {
  if (!p.model.startsWith('floor_')) continue
  const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`
  floors.set(key, (floors.get(key) ?? 0) + 1)
  if (Math.abs(((p.x - 2) / 4) - Math.round((p.x - 2) / 4)) > 1e-6) throw new Error(`地板沒對齊格子 ${p.x}`)
  if (Math.abs(((p.z - 2) / 4) - Math.round((p.z - 2) / 4)) > 1e-6) throw new Error(`地板沒對齊格子 ${p.z}`)
}
for (const [key, n] of floors) {
  if (n !== 1) throw new Error(`地板重疊 ${key}`)
}

const platform = SAMPLE_PLATFORMS[SAMPLE_PLATFORMS.length - 1]
const landing = SAMPLE_PLATFORMS[SAMPLE_PLATFORMS.length - 2]
if (!platform || !landing) throw new Error('缺少樓梯或高台')
if (platform.topY !== SAMPLE_PLATFORM_Y) throw new Error('高台高度應貼齊樓梯踏面')
if (landing.topY !== SAMPLE_PLATFORM_Y) throw new Error('最後一階應接到高台')
if (platformsFor('kenney').length !== 0) throw new Error('kenney 不該有樣本平台')
if (platformsFor('kaykit').some((p) => p.minZ > 200)) throw new Error('kaykit 平台跑進樣本區')
if (platformsFor('sample').some((p) => p.topY > SAMPLE_PLATFORM_Y + 0.01)) {
  throw new Error('樣本平台高過樓梯踏面')
}

for (const zone of Object.keys(SAMPLE_ZONES) as (keyof typeof SAMPLE_ZONES)[]) {
  const n = samplePropCount(zone)
  if (n < 8) throw new Error(`${zone} 道具只有 ${n}，至少要 8`)
}

const skeletons = SAMPLE_PLACES.filter((p) => p.model.startsWith('skeleton_'))
if (skeletons.length < 4) throw new Error('草圖替代用的骷髏要換成真模型')
if (skeletons.some((p) => !p.root?.includes('skeletons'))) throw new Error('骷髏應走 skeletons 目錄')

console.log(
  'sample-room: ok',
  Object.fromEntries((Object.keys(SAMPLE_ZONES) as (keyof typeof SAMPLE_ZONES)[]).map((z) => [z, samplePropCount(z)])),
)
