import { FEED_MAX, pushFeedItem } from '../shared/events.ts'

let list = pushFeedItem([], 'a', 1000)
list = pushFeedItem(list, 'b', 1100)
list = pushFeedItem(list, 'c', 1200)
list = pushFeedItem(list, 'd', 1300)
list = pushFeedItem(list, 'e', 1400)
if (list.length !== FEED_MAX) throw new Error('最多 4 條')
if (list[0].text !== 'b' || list[3].text !== 'e') throw new Error('應丟掉最舊的')
list = pushFeedItem(list, 'f', 5000)
if (list.length !== 1 || list[0].text !== 'f') throw new Error('逾時應淡出')
if (list.some((i) => /座標|x=|z=/.test(i.text))) throw new Error('不該有位置')
console.log('feed: ok')
