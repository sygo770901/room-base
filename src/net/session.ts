import type { GameMode } from '../../shared/modes'
import { isGameMode } from '../../shared/modes'
import type { SceneId } from '../../shared/scenes'
import { isSceneId } from '../../shared/scenes'

const PLAYER_KEY = 'rb-player-id'
const SECRET_KEY = 'rb-player-secret'
const SESSION_KEY = 'rb-session'
/** 自動回房期限（先定，昱豪可改）。 */
export const SESSION_TTL_MS = 60 * 60 * 1000

export interface RoomSession {
  playerId: string
  secret: string
  roomId: string
  name: string
  scene: SceneId
  mode: GameMode
  wantHost: boolean
  timed: boolean
  savedAt?: number
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

export function getPlayerSecret() {
  try {
    const existing = localStorage.getItem(SECRET_KEY)
    if (existing && isUuidLike(existing)) return existing
  } catch {
    /* ignore */
  }
  const secret = crypto.randomUUID()
  try {
    localStorage.setItem(SECRET_KEY, secret)
  } catch {
    /* ignore */
  }
  return secret
}

export function loadSession(): RoomSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RoomSession>
    if (!parsed || typeof parsed.roomId !== 'string' || typeof parsed.name !== 'string') return null
    const playerId = typeof parsed.playerId === 'string' && isUuidLike(parsed.playerId) ? parsed.playerId : getPlayerId()
    const secret = typeof parsed.secret === 'string' && isUuidLike(parsed.secret) ? parsed.secret : getPlayerSecret()
    const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
    if (!savedAt || Date.now() - savedAt > SESSION_TTL_MS) return null
    return {
      playerId,
      secret,
      savedAt,
      roomId: parsed.roomId.trim().slice(0, 32) || 'home',
      name: parsed.name.trim().slice(0, 16) || '訪客',
      scene: isSceneId(parsed.scene) ? parsed.scene : 'kenney',
      mode: isGameMode(parsed.mode) ? parsed.mode : 'hunt',
      wantHost: Boolean(parsed.wantHost),
      timed: Boolean(parsed.timed),
    }
  } catch {
    return null
  }
}

export function saveSession(session: RoomSession) {
  try {
    const next = { ...session, savedAt: Date.now() }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    localStorage.setItem(PLAYER_KEY, session.playerId)
    localStorage.setItem(SECRET_KEY, session.secret)
  } catch {
    /* ignore */
  }
}

export function isSessionFresh(savedAt: number | undefined, now = Date.now(), ttl = SESSION_TTL_MS) {
  return Boolean(savedAt) && now - (savedAt ?? 0) <= ttl
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
