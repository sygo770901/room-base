const url = 'https://kenney.nl/assets/modular-dungeon-kit'
const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
const text = await response.text()
console.log([...text.matchAll(/[^"' ]+\.zip/g)].map((m) => m[0]).join('\n'))
