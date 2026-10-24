import {
  POOP_DIRECT_RADIUS,
  POOP_FLIGHT_MS,
  POOP_SLOW_MUL,
  POOP_STICK_DPS,
  POOP_STICK_MS,
  POOP_ZONE_DPS,
  SMOKE_DURATION_MS,
  SMOKE_RADIUS,
  SMOKE_RANGE,
  bankPoopDamage,
  clampSmokeLanding,
  poopArcPoints,
  poopDamageThisTick,
  poopExposure,
  publicSmokeForViewer,
  publishSmokes,
  refreshPoopStick,
  refreshRoomStick,
  smokeSchedule,
  tagSlowMul,
  type SmokeCloud,
} from '../shared/smoke.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const capped = clampSmokeLanding(0, 0, 30, 0)
assert(Math.abs(capped.x - SMOKE_RANGE) < 1e-9 && capped.z === 0, `超過 ${SMOKE_RANGE} 應被伺服器夾住，得到 ${capped.x}`)
const diagonal = clampSmokeLanding(1, 2, 1 + 12, 2 + 9)
const diagDist = Math.hypot(diagonal.x - 1, diagonal.z - 2)
assert(diagDist <= SMOKE_RANGE + 1e-6, `斜向落地 ${diagDist} 不該超過 ${SMOKE_RANGE}`)
const near = clampSmokeLanding(4, 5, 7, 9)
assert(near.x === 7 && near.z === 9, '範圍內的落點不該被改')

assert(poopDamageThisTick(false, 1, 'boss') === POOP_ZONE_DPS, '臭氣區應為每秒 5 傷')
assert(poopDamageThisTick(true, 1, 'hunt') === POOP_STICK_DPS, '黏附應為每秒 8 傷')
assert(poopDamageThisTick(true, 1, 'tag') === 0, '鬼抓人不該造成傷害')
assert(SMOKE_RADIUS === 4.5, '臭氣半徑應為 4.5')
assert(POOP_DIRECT_RADIUS < SMOKE_RADIUS, '直接命中要比臭氣區小')

let bank = 0
let dealt = 0
for (let i = 0; i < 10; i++) {
  const step = bankPoopDamage(bank, false, 0.1, 'boss')
  bank = step.bank
  dealt += step.dealt
}
assert(dealt === 5 && bank < 1e-6, `臭氣區 1 秒應結算 5 傷，得到 ${dealt}`)

bank = 0
dealt = 0
for (let i = 0; i < 10; i++) {
  const step = bankPoopDamage(bank, true, 0.1, 'boss')
  bank = step.bank
  dealt += step.dealt
}
assert(dealt === 8, `黏附 1 秒應結算 8 傷，得到 ${dealt}`)
const stuckOnly = bankPoopDamage(0, true, 1, 'boss')
assert(stuckOnly.dealt === 8, '黏附不該再疊一層區域傷害')

let sticks = refreshPoopStick([], 'mob', 1_000)
sticks = refreshPoopStick(sticks, 'mob', 2_000)
assert(sticks.length === 1, `同一目標不該疊兩層黏附，現有 ${sticks.length}`)
assert(sticks[0].until === 2_000 + POOP_STICK_MS, '新的一發應刷新 4 秒')
sticks = refreshPoopStick(sticks, 'other', 2_000)
assert(sticks.length === 2, '不同目標可以各自黏住')

let roomSticks = refreshRoomStick({}, 'mob', 1_000, 'thrower-a')
roomSticks = refreshRoomStick(roomSticks, 'mob', 2_000, 'thrower-b')
assert(Object.keys(roomSticks).length === 1, '不同丟擲者打到同一目標只留一層黏附')
assert(roomSticks.mob.until === 2_000 + POOP_STICK_MS, '後來的一發應刷新黏附')
assert(roomSticks.mob.by === 'thrower-b', '刷新後記的是新的丟擲者')
const overlap = poopExposure({ stuck: false, zones: 2, mode: 'boss' })
assert(overlap.dps === POOP_ZONE_DPS, `兩團臭氣重疊仍應每秒 ${POOP_ZONE_DPS}，得到 ${overlap.dps}`)
const stuckOverlap = poopExposure({ stuck: true, zones: 2, mode: 'hunt' })
assert(stuckOverlap.dps === POOP_STICK_DPS, `黏附加上重疊臭氣應只有每秒 ${POOP_STICK_DPS}，得到 ${stuckOverlap.dps}`)

bank = 0
dealt = 0
for (let i = 0; i < 10; i++) {
  const exp = poopExposure({ stuck: false, zones: 2, mode: 'boss' })
  const step = bankPoopDamage(bank, exp.stuck, 0.1, 'boss')
  bank = step.bank
  dealt += step.dealt
}
assert(dealt === 5, `兩團臭氣 1 秒應結算 5 傷，得到 ${dealt}`)

bank = 0
dealt = 0
for (let i = 0; i < 10; i++) {
  const exp = poopExposure({ stuck: true, zones: 2, mode: 'boss' })
  const step = bankPoopDamage(bank, exp.stuck, 0.1, 'boss')
  bank = step.bank
  dealt += step.dealt
}
assert(dealt === 8, `兩人黏附重疊 1 秒應結算 8 傷，得到 ${dealt}`)

const thrownAt = 10_000
const schedule = smokeSchedule(thrownAt, 'boss')
assert(schedule.landAt === thrownAt + POOP_FLIGHT_MS, '落地時間應是丟出後的飛行')
assert(schedule.until - schedule.landAt === SMOKE_DURATION_MS, '臭氣應從落地起再持續 6 秒')
assert(schedule.until > thrownAt + SMOKE_DURATION_MS, '不該在丟出 6 秒時就結束')
assert(smokeSchedule(thrownAt, 'tag').until - smokeSchedule(thrownAt, 'tag').landAt === SMOKE_DURATION_MS, '鬼抓人的臭氣也從落地起算 6 秒')

const stickCloud: SmokeCloud = {
  id: 'smoke-stick',
  x: 3,
  z: 4,
  r: SMOKE_RADIUS,
  until: 9_000,
  sticks: [
    { id: 'hider-a', until: 8_000 },
    { id: 'ghost-1', until: 8_000 },
  ],
}
const seeker = publicSmokeForViewer(stickCloud, { id: 'ghost-1', team: 'ghost' }, 'tag')
assert(!seeker.sticks?.some((s) => s.id === 'hider-a'), '鬼不該看到別人黏住')
assert(seeker.sticks?.some((s) => s.id === 'ghost-1'), '被黏住的鬼本人應看得到自己')
const otherSeeker = publicSmokeForViewer(stickCloud, { id: 'ghost-2', team: 'ghost' }, 'tag')
assert((otherSeeker.sticks ?? []).length === 0, '沒被黏住的鬼不該看到黏附名單')
const hiderView = publicSmokeForViewer(stickCloud, { id: 'hider-b', team: 'hider' }, 'tag')
assert(hiderView.sticks?.some((s) => s.id === 'hider-a'), '躲的人仍看得到黏附')
const bossView = publicSmokeForViewer(stickCloud, { id: 'p' }, 'boss')
assert(bossView.sticks?.length === 2, '打怪時黏附名單要完整')
const published = publishSmokes(
  [stickCloud],
  { 'hider-a': { until: 8_000, by: 'ghost-1' }, 'ghost-1': { until: 8_000, by: 'hider-b' } },
  { id: 'ghost-2', team: 'ghost' },
  'tag',
  1_000,
)
assert(published.every((c) => (c.sticks ?? []).length === 0), '同步給鬼的雲不該帶別人的黏附')

assert(tagSlowMul('tag', true) === POOP_SLOW_MUL, '鬼抓人應減速 30%')
assert(Math.abs(POOP_SLOW_MUL - 0.7) < 1e-9, '30% 減速是 0.7 倍速')
assert(tagSlowMul('tag', true) === tagSlowMul('tag', true), '減速不疊加')
assert(tagSlowMul('boss', true) === 1, '打鴨王用傷害，不減速')
assert(tagSlowMul('tag', false) === 1, '沒中招不減速')

const arc = poopArcPoints(0, 0, 0, SMOKE_RANGE, 0, 0)
assert(arc[0].x === 0 && arc[0].z === 0, '預覽弧線從手上出發')
assert(Math.abs(arc[arc.length - 1].x - SMOKE_RANGE) < 1e-9, '預覽弧線落到夾過的落點')
assert(Math.max(...arc.map((p) => p.y)) > 1, '預覽應是拱起的弧線')
const mobile = poopArcPoints(2, 3, 1, 2, 3 + 6, 1)
assert(Math.hypot(mobile[mobile.length - 1].x - 2, mobile[mobile.length - 1].z - (3 + 6)) < 1e-9, '手機預覽用同一條弧線')

console.log('poop-throw: ok', { range: SMOKE_RANGE, radius: SMOKE_RADIUS, zone: POOP_ZONE_DPS, stick: POOP_STICK_DPS })
