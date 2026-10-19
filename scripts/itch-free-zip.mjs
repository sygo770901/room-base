import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const slug = process.argv[2]
const outName = process.argv[3]
if (!slug || !outName) {
  console.error('usage: node scripts/itch-free-zip.mjs <slug> <out.zip>')
  process.exit(1)
}

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

const pageRes = await request(`https://kaylousberg.itch.io/${slug}/purchase`)
const page = await pageRes.text()
const csrf =
  page.match(/name="csrf_token"\s+content="([^"]+)"/)?.[1] ??
  page.match(/content="([^"]+)"\s+name="csrf_token"/)?.[1] ??
  page.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1]
if (!csrf) throw new Error('no csrf')
const claim = await request(`https://kaylousberg.itch.io/${slug}/download_url`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    referer: `https://kaylousberg.itch.io/${slug}/purchase`,
    'x-requested-with': 'XMLHttpRequest',
  },
  body: new URLSearchParams({ csrf_token: csrf }),
})
const claimText = await claim.text()
console.log('claim', claim.status, claimText.slice(0, 400))
const url = JSON.parse(claimText).url
if (!url) throw new Error('no download url')
const pageUrl = url.startsWith('http') ? url : `https://kaylousberg.itch.io${url}`
const dl = await request(pageUrl)
let html = ''
if (dl.status >= 300 && dl.status < 400) {
  const next = await request(new URL(dl.headers.get('location'), pageUrl).href)
  html = await next.text()
} else {
  html = await dl.text()
}
const pageCsrf =
  html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1] ??
  html.match(/name="csrf_token" content="([^"]+)"/)?.[1] ??
  csrf
await mkdir('scripts', { recursive: true })
await writeFile(path.resolve('scripts', `${slug}-download.html`), html)
const files = [
  ...html.matchAll(/data-upload_id="(\d+)"/g),
  ...html.matchAll(/\/file\/(\d+)/g),
].map((m) => ({ id: m[1], name: m[0] }))
const names = [...html.matchAll(/>([^<]+\.zip)</gi)].map((m) => m[1].trim())
console.log('names', names)
console.log('ids', [...new Set(files.map((f) => f.id))])
const unique = []
const seen = new Set()
for (const f of files) {
  if (seen.has(f.id)) continue
  seen.add(f.id)
  unique.push(f)
}
console.log('files', unique)
const free =
  unique.find((f) => /free/i.test(f.name) && !/extra|source/i.test(f.name)) ??
  unique.find((f) => !/extra|source/i.test(f.name)) ??
  unique[0]
if (!free) {
  console.log(html.slice(0, 2500))
  throw new Error('no free file')
}
console.log('pick', free)
const fileRes = await request(
  `https://kaylousberg.itch.io/${slug}/file/${free.id}?source=game_download`,
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
const out = path.resolve('scripts', outName)
await pipeline(bin.body, createWriteStream(out))
console.log('saved', out)
