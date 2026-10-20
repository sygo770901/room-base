import { publicSmokeForViewer, shouldPoopHitPlayer, type SmokeCloud } from '../shared/smoke.ts'

const cloud: SmokeCloud = {
  id: 'smoke-1',
  x: 10,
  z: 20,
  r: 3,
  until: Date.now() + 8000,
  ox: 1,
  oz: 2,
  thrownAt: 1,
  landAt: 2,
  hits: ['hider-a', 'ghost-1'],
  throwerId: 'hider-b',
}

const ghostView = publicSmokeForViewer(cloud, { id: 'ghost-1', team: 'ghost' }, 'tag')
if (ghostView.ox != null || ghostView.oz != null) throw new Error('鬼不該拿到 ox/oz')
if (ghostView.throwerId) throw new Error('鬼不該拿到 throwerId')
if (ghostView.hits?.includes('hider-a')) throw new Error('鬼不該看到別人中招')
if (!ghostView.hits?.includes('ghost-1')) throw new Error('被打中的鬼本人應知道自己中招')

const otherGhost = publicSmokeForViewer(cloud, { id: 'ghost-2', team: 'ghost' }, 'tag')
if ((otherGhost.hits ?? []).length) throw new Error('沒中招的鬼不該看到名單')

if (shouldPoopHitPlayer('hider-b', 'hider', { id: 'hider-a', team: 'hider' }, 'tag')) {
  throw new Error('不該打到隊友')
}
if (shouldPoopHitPlayer('hider-b', 'hider', { id: 'hider-b', team: 'hider' }, 'tag')) {
  throw new Error('不該打到自己')
}
if (!shouldPoopHitPlayer('hider-b', 'hider', { id: 'ghost-1', team: 'ghost' }, 'tag')) {
  throw new Error('鬼抓人應打到對面')
}
if (shouldPoopHitPlayer('p1', undefined, { id: 'p2' }, 'boss')) {
  throw new Error('打鴨王不該打到隊友')
}

console.log('ghost-smoke: ok')
