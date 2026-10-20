import { FormEvent, useState } from 'react'
import { SCENE_BLURBS, SCENE_IDS, SCENE_LABELS, isSceneId, type SceneId } from '../../shared/scenes'
import { MODE_BLURBS, MODE_IDS, MODE_LABELS, isGameMode, type GameMode } from '../../shared/modes'
import { joinRoom } from '../net/socket'
import { useAppStore } from '../store'

function savedMode(): GameMode {
  const raw = localStorage.getItem('rb-mode')
  return isGameMode(raw) ? raw : 'hunt'
}

export function Lobby() {
  const roomId = useAppStore((s) => s.roomId)
  const displayName = useAppStore((s) => s.displayName)
  const setLobby = useAppStore((s) => s.setLobby)
  const [name, setName] = useState(displayName || localStorage.getItem('rb-name') || '')
  const [room, setRoom] = useState(roomId || localStorage.getItem('rb-room') || 'home')
  const [scene, setScene] = useState<SceneId>(() => {
    const raw = localStorage.getItem('rb-scene')
    return isSceneId(raw) ? raw : 'kenney'
  })
  const [mode, setMode] = useState<GameMode>(savedMode)
  const [timed, setTimed] = useState(localStorage.getItem('rb-timed') === '1')
  const [busy, setBusy] = useState(false)
  const joinError = useAppStore((s) => s.joinError)
  const [error, setError] = useState('')

  async function enter(wantHost: boolean) {
    setError('')
    const n = name.trim() || '訪客'
    const r = room.trim() || 'home'
    setBusy(true)
    try {
      localStorage.setItem('rb-name', n)
      localStorage.setItem('rb-room', r)
      localStorage.setItem('rb-scene', scene)
      localStorage.setItem('rb-mode', mode)
      localStorage.setItem('rb-timed', timed ? '1' : '0')
      setLobby(n, r)
      await joinRoom(r, n, wantHost, scene, mode, timed)
    } catch (e) {
      setError(e instanceof Error ? e.message : '連線失敗')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void enter(false)
  }

  return (
    <div className="lobby">
      <form className="lobby-card" onSubmit={onSubmit}>
        <div className="lobby-scroll">
          <h1>BOSS大逃殺</h1>
          <p className="lobby-goal">
            {mode === 'boss' ? '打倒鴨王' : mode === 'tag' ? '躲 30 秒，別被抓到' : '打倒地城怪物'}
          </p>
          <div className="scene-pick compact" role="radiogroup" aria-label="地圖">
            {SCENE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={scene === id}
                className={scene === id ? 'on' : ''}
                onClick={() => setScene(id)}
              >
                <strong>{SCENE_LABELS[id]}</strong>
                <span>{SCENE_BLURBS[id]}</span>
              </button>
            ))}
          </div>
          <div className="scene-pick mode-pick compact" role="radiogroup" aria-label="模式">
            {MODE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className={mode === id ? 'on' : ''}
                onClick={() => setMode(id)}
              >
                <strong>{MODE_LABELS[id]}</strong>
                <span>{MODE_BLURBS[id]}</span>
              </button>
            ))}
          </div>
          {(mode === 'boss' || mode === 'tag') && (
            <div className="scene-pick mode-pick compact" role="radiogroup" aria-label="時間">
              <button type="button" role="radio" aria-checked={!timed} className={!timed ? 'on' : ''} onClick={() => setTimed(false)}>
                <strong>不計時</strong>
              </button>
              <button type="button" role="radio" aria-checked={timed} className={timed ? 'on' : ''} onClick={() => setTimed(true)}>
                <strong>5 分鐘</strong>
              </button>
            </div>
          )}
          <div className="lobby-fields">
            <label>
              名稱
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="小明" maxLength={16} />
            </label>
            <label>
              房號
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="home" maxLength={32} />
            </label>
          </div>
          {(error || joinError) && <div className="lobby-error">{error || joinError}</div>}
        </div>
        <div className="lobby-actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => void enter(true)}>
            我是房主
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '進入中…' : '進入房間'}
          </button>
        </div>
      </form>
    </div>
  )
}
