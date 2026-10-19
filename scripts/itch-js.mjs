const text = await (await fetch('https://static.itch.io/extern.min.js?1791798061')).text()
let from = 0
let n = 0
while (n < 8) {
  const idx = text.indexOf('ir=', from)
  if (idx < 0 || idx > 140000) break
  if (idx > 120000) {
    console.log('\n---', idx)
    console.log(text.slice(idx, idx + 200))
    n++
  }
  from = idx + 3
}
const call = text.indexOf('ir(this.game.slug')
console.log('call context', text.slice(call - 800, call))
