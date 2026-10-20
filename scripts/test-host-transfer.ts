import { pickLiveHost } from '../shared/host.ts'

const a = pickLiveHost(['host', 'guest'], ['host'], 'host')
if (a !== 'guest') throw new Error(`房主斷線應交給連線中的人，得到 ${a}`)

const stay = pickLiveHost(['host', 'guest'], ['guest'], 'host')
if (stay !== 'host') throw new Error('房主仍在線不該移交')

const back = pickLiveHost(['host', 'guest'], [], 'guest', 'host')
if (back !== 'guest') throw new Error('原房主回來不該搶回')

const only = pickLiveHost(['host'], [], null, 'host')
if (only !== 'host') throw new Error('只剩他時應當房主')

const none = pickLiveHost(['host', 'guest'], ['host', 'guest'], 'host')
if (none !== null) throw new Error('全房斷線時不該指派')

console.log('host-transfer: ok')
