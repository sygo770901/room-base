import type { Server } from 'socket.io'
import { liveFeed, pushFeedItem, type FeedItem } from '../shared/events.ts'

export function announce(room: { roomId: string; feed?: FeedItem[] }, io: Server, text: string, now = Date.now()) {
  room.feed = pushFeedItem(room.feed, text, now)
  io.to(room.roomId).emit('feed:sync', liveFeed(room.feed, now))
}
