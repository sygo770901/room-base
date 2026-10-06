import { FormEvent, useState } from 'react'
import { joinRoom } from '../net/socket'
import { useAppStore } from '../store'

export function Lobby() {
  const roomId = useAppStore((s) => s.roomId)
  const displayName = useAppStore((s) => s.displayName)
  const setLobby = useAppStore((s) => s.setLobby)
  const [name, setName] = useState(displayName || localStorage.getItem('rb-name') || '')
  const [room, setRoom] = useState(roomId || localStorage.getItem('rb-room') || 'home')
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
      setLobby(n, r)
      await joinRoom(r, n, wantHost)
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
        <h1>Room Base</h1>
        <p>
          你的數位房間基地。留言與家具配置會保存；房主可拖家具；可開語音。朋友用同一個房間 ID 進來。
        </p>
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
