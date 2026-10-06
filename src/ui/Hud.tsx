import { FormEvent, useState } from 'react'
import { disconnectSocket, emitAddNote, emitSit } from '../net/socket'
import { setMicEnabled } from '../net/voice'
import { useAppStore } from '../store'

export function Hud() {
  const players = useAppStore((s) => s.players)
  const roomId = useAppStore((s) => s.roomId)
  const selfId = useAppStore((s) => s.selfId)
  const toast = useAppStore((s) => s.toast)
  const micOn = useAppStore((s) => s.micOn)
  const setMicOn = useAppStore((s) => s.setMicOn)
  const setToast = useAppStore((s) => s.setToast)
  const self = selfId ? players[selfId] : null
  const [note, setNote] = useState('')
  const [busyMic, setBusyMic] = useState(false)

  async function sendNote(e: FormEvent) {
    e.preventDefault()
    const text = note.trim()
    if (!text) return
    await emitAddNote(text)
    setNote('')
  }

  async function toggleMic() {
    setBusyMic(true)
    try {
      const next = !micOn
      await setMicEnabled(next)
      setMicOn(next)
      setToast(next ? '麥克風已開啟' : '麥克風已關閉')
      setTimeout(() => setToast(null), 1800)
    } catch {
      setToast('無法取得麥克風權限')
      setTimeout(() => setToast(null), 2200)
    } finally {
      setBusyMic(false)
    }
  }

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="pill">
          房間 <strong>{roomId}</strong>
          {self?.role === 'host' ? ' · 你是房主' : ' · 訪客'}
          {self?.role === 'host' ? ' · 可拖曳家具' : ''}
        </div>
        <div className="pill player-list">
          {Object.values(players).map((p) => (
            <div className="player-row" key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span>
                {p.name}
                {p.id === selfId ? '（你）' : ''}
                {p.seated ? ` · 坐${p.seated}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="hud-bottom">
        <div className="help">
          WASD 移動（有碰撞）· 點綠色圈坐下 · E 起身
          <br />
          {self?.role === 'host' ? '房主可拖家具改裝潢 · ' : ''}
          留言會永久保存於伺服器
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={busyMic}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                background: micOn ? '#81b29a' : '#ddd',
                fontWeight: 600,
              }}
            >
              {micOn ? '語音開' : '語音關'}
            </button>
            <button
              type="button"
              onClick={() => void emitSit(null)}
              style={{ border: 0, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
            >
              起身
            </button>
            <button
              type="button"
              onClick={() => disconnectSocket()}
              style={{ border: 0, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
            >
              離開
            </button>
          </div>
        </div>
        <form className="note-panel" onSubmit={sendNote}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="在這間房留下一句話…"
            maxLength={80}
          />
          <button type="submit">貼上</button>
        </form>
      </div>
    </div>
  )
}
