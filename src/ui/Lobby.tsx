import { FormEvent, useState } from 'react'
import type { SceneId } from '../../shared/scenes'
import { MODE_BLURBS, MODE_IDS, MODE_LABELS, isGameMode, type GameMode } from '../../shared/modes'
import { joinRoom } from '../net/socket'
import { useAppStore } from '../store'

const SCENES: { id: SceneId; title: string; text: string }[] = [
  {
    id: 'kenney',
    title: 'Kenney 模組地城',
    text: '現在這套。紫色石牆、橙色地板、柱子。',
  },
  {
    id: 'kaykit',
    title: 'KayKit Dungeon Pack 1.1',
    text: '石磚貼圖、門、鐵柵、樓梯、天花板。面數是為手機準備的。',
  },
]

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
  const [scene, setScene] = useState<SceneId>(localStorage.getItem('rb-scene') === 'kaykit' ? 'kaykit' : 'kenney')
  const [mode, setMode] = useState<GameMode>(savedMode)
  const [busy, setBusy] = useState(false)
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
      setLobby(n, r)
      await joinRoom(r, n, wantHost, scene, mode)
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
        <h1>BOSS大逃殺</h1>
        <p>
          玩家都是較瘦的遊俠，右手單手劍。進房前選場景和模式。房間裡已經有人時，會沿用開房時的設定。
        </p>
        <div className="scene-pick" role="radiogroup" aria-label="場景">
          {SCENES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={scene === item.id}
              className={scene === item.id ? 'on' : ''}
              onClick={() => setScene(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
        <div className="scene-pick mode-pick" role="radiogroup" aria-label="模式">
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
        <label>
          顯示名稱
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="小明" maxLength={16} />
        </label>
        <label>
          房間 ID
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="home" maxLength={32} />
        </label>
        {error && <div style={{ color: '#e07a5f' }}>{error}</div>}
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
