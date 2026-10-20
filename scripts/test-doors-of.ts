import { doorsOf, doorwayModelsOf } from '../shared/mapData.ts'
import { createDoors, nearestDoor } from '../shared/doors.ts'
import { gameKeysBlocked } from '../src/scene/inputLock.ts'

for (const scene of ['kenney', 'kaykit', 'jungle'] as const) {
  const defs = doorsOf(scene)
  if (defs.length < 4) throw new Error(`${scene} 門太少`)
  const doors = createDoors(defs)
  if (doors.length !== defs.length) throw new Error(`${scene} createDoors 數量不對`)
  const models = doorwayModelsOf(scene)
  if (!models.length) throw new Error(`${scene} 沒有門口模型`)
  for (const def of defs) {
    let best = Infinity
    for (const m of models) best = Math.min(best, Math.hypot(m.x - def.x, m.z - def.z))
    if (best >= 0.5) throw new Error(`${scene} ${def.id} 離門口模型 ${best.toFixed(2)}，應 < 0.5`)
  }
  const enter = nearestDoor(78, 34, defs, 1.5)
  if (!enter) throw new Error(`${scene} 入口沒有門`)
}

if (doorsOf('kenney') === doorsOf('kaykit')) throw new Error('各地圖應各自一份清單')
if (doorsOf('future-map').length === 0) throw new Error('未知地圖至少要有預設門')
if (!gameKeysBlocked({ tagName: 'INPUT' })) throw new Error('留言框有焦點時 E 不該進遊戲')
if (!gameKeysBlocked({ tagName: 'TEXTAREA' })) throw new Error('多行留言框有焦點時 E 不該進遊戲')
if (!gameKeysBlocked({ tagName: 'DIV', isContentEditable: true })) throw new Error('可編輯留言有焦點時 E 不該進遊戲')
if (gameKeysBlocked({ tagName: 'BODY' })) throw new Error('沒有留言框時不該擋 E')
console.log('doors-of: ok', doorsOf('jungle').map((d) => d.id).join(','))
