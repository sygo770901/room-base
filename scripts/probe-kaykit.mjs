const res = await fetch('https://api.github.com/repos/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0/git/trees/main?recursive=1', {
  headers: { 'user-agent': 'room-base', accept: 'application/vnd.github+json' },
})
const data = await res.json()
const paths = (data.tree ?? []).map((n) => n.path)
const want = paths.filter((p) =>
  /ceiling|wall\.gltf|wall_door|wall_gated|floor_tile_large|torch_mounted|stairs_long|dungeon_texture|colormap|\.png/i.test(p),
)
console.log(want.join('\n'))
console.log('--- png count', paths.filter((p) => p.endsWith('.png')).length)
