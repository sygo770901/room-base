import { FormEvent, useState } from 'react'
import { disconnectSocket, emitSit } from '../net/socket'
import { setMicEnabled } from '../net/voice'
import { useAppStore } from '../store'
import { VirtualJoystick } from './VirtualJoystick'

export function Hud() {
  const players = useAppStore((s) => s.players)
  const roomId = useAppStore((s) => s.roomId)
  const selfId = useAppStore((s) => s.selfId)
  const toast = useAppStore((s) => s.toast)
  const micOn = useAppStore((s) => s.micOn)
  const followCam = useAppStore((s) => s.followCam)
  const pendingNote = useAppStore((s) => s.pendingNote)
  const setMicOn = useAppStore((s) => s.setMicOn)
  const setToast = useAppStore((s) => s.setToast)
  const setFollowCam = useAppStore((s) => s.setFollowCam)
  const setPendingNote = useAppStore((s) => s.setPendingNote)
  const self = selfId ? players[selfId] : null
  const [note, setNote] = useState('')
  const [fontSize, setFontSize] = useState(0.12)
  const [busyMic, setBusyMic] = useState(false)

  function armNote(e: FormEvent) {
    e.preventDefault()
    const text = note.trim()
    if (!text) return
    setPendingNote({ text, fontSize })
    setToast('點地板任意位置貼上便籤')
    setTimeout(() => setToast(null), 2200)
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
          {self?.role === 'host' ? ' · 房主可拖家具' : ' · 訪客'}
          {pendingNote ? ' · 點地板貼便籤中' : ''}
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

      <VirtualJoystick />

      <div className="hud-bottom">
        <div className="help">
          WASD／搖桿移動 · 右鍵拖曳旋轉視角 · 滾輪縮放
          <br />
          撞家具會微微推動 · 點綠圈坐下 · E 起身
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="hud-btn" onClick={() => setFollowCam(!followCam)}>
              {followCam ? '自由視角' : '跟隨角色'}
            </button>
            <button type="button" className="hud-btn" onClick={() => void toggleMic()} disabled={busyMic}>
              {micOn ? '語音開' : '語音關'}
            </button>
            <button type="button" className="hud-btn" onClick={() => void emitSit(null)}>
              起身
            </button>
            {pendingNote && (
              <button type="button" className="hud-btn" onClick={() => setPendingNote(null)}>
                取消貼籤
              </button>
            )}
            <button type="button" className="hud-btn" onClick={() => disconnectSocket()}>
              離開
            </button>
          </div>
        </div>
        <form className="note-panel" onSubmit={armNote}>
          <div className="note-font">
            <label>
              字級 {fontSize.toFixed(2)}
              <input
                type="range"
                min={0.06}
                max={0.35}
                step={0.01}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </label>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="輸入留言後按貼上，再點地板放置…"
            maxLength={80}
          />
          <button type="submit">貼上</button>
        </form>
      </div>
    </div>
  )
}
