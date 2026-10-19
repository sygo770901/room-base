import { computeAwards } from '../shared/awards.ts'

const boss = computeAwards({
  mode: 'boss',
  names: { a: '甲', b: '乙', c: '丙' },
  damage: { a: 100, b: 100, c: 10 },
  taken: { b: 40 },
  dispenserKills: {},
  rescues: { c: 2 },
})
if (!boss.find((x) => x.id === 'dps' && x.names.includes('甲') && x.names.includes('乙'))) {
  throw new Error('輸出王應並列')
}
if (boss.find((x) => x.id === 'disp')) throw new Error('沒人打掉飲水機不該顯示')
if (!boss.find((x) => x.id === 'rescue' && x.names[0] === '丙')) throw new Error('應有救援英雄')

const tag = computeAwards({
  mode: 'tag',
  names: { a: '甲', b: '乙' },
  surviveSec: { a: 80 },
  catches: { b: 3 },
  hideMs: { a: 12000 },
})
if (tag.length !== 3) throw new Error(`鬼抓人應有 3 獎，得到 ${tag.length}`)
console.log('awards: ok', boss.map((a) => a.title).join(','), tag.map((a) => a.title).join(','))
