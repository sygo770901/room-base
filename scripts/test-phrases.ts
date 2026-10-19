import { phraseAt, QUICK_PHRASES } from '../shared/phrases.ts'

if (QUICK_PHRASES.length !== 6) throw new Error('應有 6 句')
if (phraseAt(0) !== '這邊！') throw new Error('第 1 句不對')
if (phraseAt(5) !== 'GG') throw new Error('第 6 句不對')
if (phraseAt(9) !== null) throw new Error('超出範圍應為空')
console.log('phrases: ok')
