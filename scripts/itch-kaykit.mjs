const jar = new Map()
function store(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
async function request(url, init = {}) {
  const res = await fetch(url, {
    redirect: 'manual',
    ...init,
    headers: { cookie: cookieHeader(), 'user-agent': 'Mozilla/5.0', ...(init.headers ?? {}) },
  })
  store(res)
  return res
}

const pageRes = await request('https://kaylousberg.itch.io/kaykit-dungeon-pack/purchase')
const page = await pageRes.text()
const csrf = page.match(/name="csrf_token" content="([^"]+)"/)?.[1]
  ?? page.match(/csrf_token"\s+value="([^"]+)"/)?.[1]
console.log('csrf', Boolean(csrf))
const body = new URLSearchParams({ csrf_token: csrf, price: '0' })
const claim = await request('https://kaylousberg.itch.io/kaykit-dungeon-pack/purchase', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    referer: 'https://kaylousberg.itch.io/kaykit-dungeon-pack/purchase',
    'x-requested-with': 'XMLHttpRequest',
  },
  body,
})
console.log('claim', claim.status, claim.headers.get('content-type'), claim.headers.get('location'))
const text = await claim.text()
console.log(text.slice(0, 800))
