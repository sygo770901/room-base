import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

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
const csrf =
  page.match(/name="csrf_token"\s+content="([^"]+)"/)?.[1] ??
  page.match(/content="([^"]+)"\s+name="csrf_token"/)?.[1] ??
  page.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1]
if (!csrf) {
  const i = page.indexOf('csrf')
  console.log(page.slice(Math.max(0, i - 80), i + 180))
  throw new Error('no csrf')
}
const claim = await request('https://kaylousberg.itch.io/kaykit-dungeon-pack/download_url', {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    referer: 'https://kaylousberg.itch.io/kaykit-dungeon-pack/purchase',
    'x-requested-with': 'XMLHttpRequest',
  },
  body: new URLSearchParams({ csrf_token: csrf }),
})
const claimText = await claim.text()
console.log('claim', claim.status, claimText.slice(0, 500))
const url = JSON.parse(claimText).url
if (!url) throw new Error('no download url')
const dl = await request(url.startsWith('http') ? url : `https://kaylousberg.itch.io${url}`)
console.log('page', dl.status, dl.headers.get('location'))
let html = ''
if (dl.status >= 300 && dl.status < 400) {
  const next = await request(new URL(dl.headers.get('location'), url).href)
  html = await next.text()
} else {
  html = await dl.text()
}
const pageUrl = url.startsWith('http') ? url : `https://kaylousberg.itch.io${url}`
const pageCsrf = html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1] ?? csrf
const fileRes = await request(
  'https://kaylousberg.itch.io/kaykit-dungeon-pack/file/18356749?source=game_download',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      referer: pageUrl,
      'x-requested-with': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ csrf_token: pageCsrf }),
  },
)
const fileText = await fileRes.text()
console.log('file', fileRes.status, fileText.slice(0, 400))
const fileUrl = JSON.parse(fileText).url
if (!fileUrl) throw new Error('no file url')
const bin = await fetch(fileUrl, { headers: { 'user-agent': 'Mozilla/5.0' } })
console.log('bin', bin.status, bin.headers.get('content-type'), bin.headers.get('content-length'))
if (!bin.ok || !bin.body) throw new Error('download failed')
await mkdir('scripts', { recursive: true })
const out = path.resolve('scripts/kaykit-1.1.zip')
await pipeline(bin.body, createWriteStream(out))
console.log('saved', out)
