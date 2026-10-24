import { MAP_WORLD } from '../shared/dungeon.ts'
import { overviewShot, worldBoundsOf } from '../shared/mapView.ts'
import { lobbySceneIds, placeSetFor, sceneIdForLobbyChoice, SCENE_LABELS, type SceneId } from '../shared/scenes.ts'

const expected: Record<string, SceneId> = {
  kenney: 'kenney',
  kaykit: 'kaykit',
  jungle: 'jungle',
  sample: 'sample',
}

const lobby = lobbySceneIds(false)
if (lobby.includes('heightlab')) throw new Error('正式大廳不該列出高度試驗')
if (lobby.join(',') !== 'kenney,kaykit,jungle,sample') throw new Error(`大廳清單不對：${lobby.join(',')}`)

for (const id of lobby) {
  if (sceneIdForLobbyChoice(id) !== expected[id]) {
    throw new Error(`大廳選項 ${id} 對到 ${sceneIdForLobbyChoice(id)}，應為 ${expected[id]}`)
  }
  if (sceneIdForLobbyChoice(SCENE_LABELS[id]) !== id) {
    throw new Error(`大廳標籤 ${SCENE_LABELS[id]} 沒對回 ${id}`)
  }
  if (placeSetFor(id) === 'heightlab') throw new Error(`${id} 不該載入高度試驗零件`)
}

if (sceneIdForLobbyChoice('heightlab') !== null) throw new Error('正式大廳不該選得到 heightlab')
if (sceneIdForLobbyChoice('高度試驗') !== null) throw new Error('正式大廳不該選得到高度試驗')
if (sceneIdForLobbyChoice('heightlab', true) !== 'heightlab') throw new Error('開發環境要能選高度試驗')
if (placeSetFor('heightlab') !== 'heightlab') throw new Error('高度試驗要有自己的零件')
if (placeSetFor('kenney') !== 'kenney') throw new Error('kenney 零件被換掉')
if (placeSetFor('kaykit') !== 'kaykit') throw new Error('kaykit 零件被換掉')
if (placeSetFor('jungle') !== 'kaykit') throw new Error('jungle 應沿用 kaykit 零件')
if (placeSetFor('sample') !== 'sample') throw new Error('樣本零件被換掉')

for (const id of ['kenney', 'kaykit', 'jungle'] as const) {
  const b = worldBoundsOf(id)
  const spanX = b.maxX - b.minX
  const spanZ = b.maxZ - b.minZ
  if (spanX !== MAP_WORLD.maxX - MAP_WORLD.minX || spanZ !== MAP_WORLD.maxZ - MAP_WORLD.minZ) {
    throw new Error(`${id} 被縮成 ${spanX}x${spanZ}，整張地城應該載入`)
  }
  const shot = overviewShot(id)
  if (shot.pos[1] < spanX * 0.4) throw new Error(`${id} 俯視太近，看不到整張圖`)
  if (shot.far < shot.pos[1] + spanX) throw new Error(`${id} 遠裁面切到地圖`)
}

const lab = worldBoundsOf('heightlab')
if (lab.maxX - lab.minX > 40 || lab.maxZ - lab.minZ > 40) throw new Error('高度試驗不該用大地圖範圍')
const sample = worldBoundsOf('sample')
if (sample.minZ < 100) throw new Error('樣本俯視範圍跑回舊地圖')

console.log('lobby-scenes: ok', lobby.join(','))
