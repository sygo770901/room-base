import { coneAgreesWithMove, minimapStep, minimapYawFromForward, turnRightDelta, worldToMinimap } from '../shared/minimap.ts'

const size = 100
const pad = 0
const walk = 5.2 * 3

const north = minimapStep(80, 40, 80, 40 + walk, size, pad)
if (north.dy >= 0) throw new Error('往北走，小地圖點應往上')
if (!coneAgreesWithMove(0, 1, 0, walk)) throw new Error('朝北走應與扇形同向')

const east = minimapStep(80, 40, 80 + walk, 40, size, pad)
if (east.dx <= 0) throw new Error('往東走，小地圖點應往右')
if (!coneAgreesWithMove(1, 0, walk, 0)) throw new Error('朝東走應與扇形同向')

const south = minimapStep(80, 40, 80, 40 - walk, size, pad)
if (south.dy <= 0) throw new Error('往南走，小地圖點應往下')
if (!coneAgreesWithMove(0, -1, 0, -walk)) throw new Error('朝南走應與扇形同向')

const west = minimapStep(80, 40, 80 - walk, 40, size, pad)
if (west.dx >= 0) throw new Error('往西走，小地圖點應往左')
if (!coneAgreesWithMove(-1, 0, -walk, 0)) throw new Error('朝西走應與扇形同向')

const yNorth = minimapYawFromForward(0, 1)
const yEast = minimapYawFromForward(1, 0)
const ySouth = minimapYawFromForward(0, -1)
const yWest = minimapYawFromForward(-1, 0)
if (turnRightDelta(yNorth, yEast) <= 0) throw new Error('鏡頭右轉：北→東，扇形應右轉')
if (turnRightDelta(yEast, ySouth) <= 0) throw new Error('鏡頭右轉：東→南，扇形應右轉')
if (turnRightDelta(ySouth, yWest) <= 0) throw new Error('鏡頭右轉：南→西，扇形應右轉')
if (turnRightDelta(yWest, yNorth) <= 0) throw new Error('鏡頭右轉：西→北，扇形應右轉')

const a = worldToMinimap(0, 0, size, pad)
const b = worldToMinimap(0, 10, size, pad)
if (b.y >= a.y) throw new Error('世界 +Z（北）應畫在小地圖上方')

console.log('minimap: ok', {
  north: north.dy < 0 ? 'up' : 'down',
  east: east.dx > 0 ? 'right' : 'left',
  south: south.dy > 0 ? 'down' : 'up',
  west: west.dx < 0 ? 'left' : 'right',
})
