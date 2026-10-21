import { nextMapLoadOnEnter, showMapLoadOverlay, showMapLoadSlow } from '../src/load/mapLoadState.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const done = { active: true, failed: false, loaded: 32, total: 32, progress: 100, slow: true }
assert(!showMapLoadOverlay(done), '32/32 100% 時進度卡必須關掉')
assert(!showMapLoadSlow(done), '載入完成後「載入較慢」也要消失')

assert(
  showMapLoadOverlay({ active: true, failed: false, loaded: 31, total: 32, progress: 96, slow: false }),
  '還沒載完時進度卡要留著',
)
assert(
  showMapLoadOverlay({ active: true, failed: false, loaded: 0, total: 0, progress: 0, slow: false }),
  '剛開始、總數還沒記上時進度卡要留著',
)
assert(
  !showMapLoadOverlay({ active: true, failed: true, loaded: 32, total: 32, progress: 100, slow: true }),
  '失敗時改顯示失敗卡，不再顯示進度卡',
)

const prev = {
  phase: 'room',
  scene: 'kaykit',
  mapLoadActive: false,
  mapLoadFailed: false,
  mapLoadLoaded: 32,
  mapLoadTotal: 32,
  mapLoadProgress: 100,
  mapLoadSlow: true,
  mapLoadErrors: [] as string[],
}
const again = nextMapLoadOnEnter(prev, 'kaykit')
assert(!again.mapLoadActive && !again.mapLoadSlow, '同一張圖載完後再進房（重連、開打）不該把進度卡打開')
assert(again.mapLoadLoaded === 32 && again.mapLoadProgress === 100, '載完的計數要留著')

const swung = { ...done, active: true }
assert(!showMapLoadOverlay(swung) && !showMapLoadSlow(swung), '按攻擊把 active 打開時，載完的進度卡仍要關著')

const fresh = nextMapLoadOnEnter({ ...prev, phase: 'lobby' }, 'kenney')
assert(fresh.mapLoadActive && fresh.mapLoadLoaded === 0 && fresh.mapLoadTotal === 0, '從大廳進新地圖要重新顯示進度')

const switched = nextMapLoadOnEnter(prev, 'jungle')
assert(switched.mapLoadActive && switched.mapLoadLoaded === 0 && !switched.mapLoadSlow, '換地圖要重開進度，並清掉「載入較慢」')

console.log('map-load-overlay: ok')
