import type { GameMode } from '../../shared/modes'
import { isGameMode } from '../../shared/modes'
import type { SceneId } from '../../shared/scenes'
import { isSceneId } from '../../shared/scenes'

const PLAYER_KEY = 'rb-player-id'
const SESSION_KEY = 'rb-session'

export interface RoomSession {
  playerId: string
  roomId: string
  name: string
  scene: SceneId
  mode: GameMode
  wantHost: boolean
}

function isUuidLike(value: string) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(value)
}

export function getPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_KEY)
    if (existing && isUuidLike(existing)) return existing
  } catch {
    /* ignore */
  }
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(PLAYER_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

export function loadSession(): RoomSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RoomSession>
    if (!parsed || typeof parsed.roomId !== 'string' || typeof parsed.name !== 'string') return null
    const playerId = typeof parsed.playerId === 'string' && isUuidLike(parsed.playerId) ? parsed.playerId : getPlayerId()
    return {
      playerId,
      roomId: parsed.roomId.trim().slice(0, 32) || 'home',
      name: parsed.name.trim().slice(0, 16) || '訪客',
      scene: isSceneId(parsed.scene) ? parsed.scene : 'kenney',
      mode: isGameMode(parsed.mode) ? parsed.mode : 'hunt',
      wantHost: Boolean(parsed.wantHost),
    }
  } catch {
    return null
  }
}

export function saveSession(session: RoomSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    localStorage.setItem(PLAYER_KEY, session.playerId)
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
