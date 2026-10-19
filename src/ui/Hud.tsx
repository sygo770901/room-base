import { FormEvent, useEffect, useState } from 'react'
import { disconnectSocket, emitAddNote, emitRemoveNote, emitRestart, emitUpdateNote, performAttack } from '../net/socket'
import { setMicEnabled } from '../net/voice'
import { useAppStore } from '../store'
import { VirtualJoystick } from './VirtualJoystick'

export function Hud() {
  const players = useAppStore((s) => s.players)
  const roomId = useAppStore((s) => s.roomId)
  const selfId = useAppStore((s) => s.selfId)
  const toast = useAppStore((s) => s.toast)
  const micOn = useAppStore((s) => s.micOn)
  const pendingNote = useAppStore((s) => s.pendingNote)
  const noteAsk = useAppStore((s) => s.noteAsk)
  const notes = useAppStore((s) => s.notes)
  const setMicOn = useAppStore((s) => s.setMicOn)
  const setToast = useAppStore((s) => s.setToast)
  const setPendingNote = useAppStore((s) => s.setPendingNote)
  const setNoteAsk = useAppStore((s) => s.setNoteAsk)
  const self = selfId ? players[selfId] : null
  const mode = useAppStore((s) => s.mode)
  const matchOver = useAppStore((s) => s.matchOver)
  const monsters = useAppStore((s) => s.monsters)
  const timeLeftMs = useAppStore((s) => s.timeLeftMs)
  const hostId = useAppStore((s) => s.hostId)
  const startInMs = useAppStore((s) => s.startInMs)
  const [note, setNote] = useState('')
  const [clock, setClock] = useState(timeLeftMs)
  const [countMs, setCountMs] = useState(startInMs)
  const [goFlash, setGoFlash] = useState(false)
  const [fontSize, setFontSize] = useState(0.12)

  useEffect(() => {
    setClock(timeLeftMs)
    if (timeLeftMs == null) return
    const origin = Date.now()
    const base = timeLeftMs
    const id = window.setInterval(() => setClock(Math.max(0, base - (Date.now() - origin))), 250)
    return () => window.clearInterval(id)
  }, [timeLeftMs])

  useEffect(() => {
    setCountMs(startInMs)
    setGoFlash(false)
    if (startInMs <= 0) return
    const origin = Date.now()
    const base = startInMs
    const id = window.setInterval(() => {
      const left = Math.max(0, base - (Date.now() - origin))
      setCountMs(left)
      if (left <= 0) {
        setGoFlash(true)
        window.setTimeout(() => setGoFlash(false), 1400)
      }
    }, 80)
    return () => window.clearInterval(id)
  }, [startInMs])
  const [busyMic, setBusyMic] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const managed = noteAsk?.kind === 'manage' ? notes.find((n) => n.id === noteAsk.id) : null

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
          {self?.role === 'host' ? ' · 房主' : ' · 訪客'}
          {mode === 'boss' ? ' · 打鴨王' : ' · 地城狩獵'}
          {pendingNote ? ' · 點地板貼便籤中' : ''}
          {mode === 'boss' && clock != null && clock > 0 && !matchOver && (
            <span className={clock <= 30_000 ? 'time-low' : ''}>
              {' '}
              · {Math.floor(clock / 60000)}:{String(Math.floor((clock % 60000) / 1000)).padStart(2, '0')}
            </span>
          )}
          <div className="hp-bar" title="生命">
            <span style={{ width: `${Math.max(0, Math.min(100, self?.hp ?? 100))}%` }} />
          </div>
        </div>
        <div className="pill player-list">
          {Object.values(players).map((p) => (
            <div className="player-row" key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span>
                {p.name}
                {p.id === selfId ? '（你）' : ''}
                {p.hp != null && p.hp < 100 ? ` · ${p.hp}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {mode === 'boss' && !matchOver && countMs > 0 && (
        <div className="countdown-banner" aria-live="polite">
          {Math.max(1, Math.ceil(countMs / 1000))}
        </div>
      )}
      {mode === 'boss' && !matchOver && goFlash && countMs <= 0 && (
        <div className="countdown-banner go">開打！</div>
      )}
      {mode === 'boss' && !matchOver && countMs <= 0 && !goFlash && (
        <div className="boss-hint">鴨大王在東南王房</div>
      )}

      {mode === 'boss' && !matchOver && (
        <div className="boss-objective">
          {monsters
            .filter((m) => m.kind === 'duck-king' || m.kind === 'dispenser')
            .map((m) => {
              const pct = Math.max(0, Math.min(100, Math.round((m.hp / Math.max(1, m.maxHp)) * 100)))
              return (
                <div key={m.id}>
                  {m.name} {m.alive ? `${pct}%` : '已倒下'}
                  {m.kind === 'duck-king' && m.alive && (
                    <div className="boss-hp">
                      <span style={{ width: `${pct}%` }} />
                      <i className="phase-mark" />
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {matchOver && (
        <div className="modal match-over">
          <p>{matchOver.teamWin ? '全隊勝利' : '全隊失敗'}</p>
          <p className="modal-preview">
            {matchOver.reason === 'timeout' ? '時間到，鴨大王還活著。' : '全隊打倒了鴨大王與飲水機。'}
          </p>
          <ol className="rank-list">
            {(matchOver.ranking ?? []).map((row, i) => (
              <li key={row.id} className={i === 0 ? 'rank-first' : ''}>
                {i === 0 ? '第一名 · ' : ''}
                {row.name}　{row.dmg}
              </li>
            ))}
          </ol>
          {selfId && hostId === selfId ? (
            <button type="button" className="restart-btn" onClick={() => emitRestart()}>
              再來一局
            </button>
          ) : (
            <p className="modal-preview">等房主開下一局</p>
          )}
        </div>
      )}

      <VirtualJoystick />

      {!matchOver && (
        <button type="button" className="attack-btn" onClick={() => performAttack()}>
          攻擊
        </button>
      )}

      <div className="dock">
        <button type="button" className="hud-btn" onClick={() => void toggleMic()} disabled={busyMic}>
          {micOn ? '語音開' : '語音關'}
        </button>
        <button type="button" className="hud-btn" onClick={() => disconnectSocket()}>
          離開
        </button>
      </div>

      <div className="hud-bottom">
        <div className="help">
          WASD／搖桿移動 · 右鍵或手機單指拖曳繞角色看 · 滾輪／雙指縮放（被牆擋住會自動拉近）
          <br />
          左鍵、F 或攻擊鈕揮劍 · E 靠木箱躲藏，再走會離開
          {pendingNote ? ' · 移動滑鼠看虛影，點地面後確認' : ''}
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
          {pendingNote && (
            <button type="button" onClick={() => setPendingNote(null)}>
              取消
            </button>
          )}
        </form>
      </div>

      {noteAsk?.kind === 'place' && (
        <div className="modal">
          <p>要把便籤貼在這裡嗎？</p>
          <p className="modal-preview">{noteAsk.text}</p>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                void emitAddNote(noteAsk.text, noteAsk.position, noteAsk.fontSize).then(() => {
                  setPendingNote(null)
                  setNoteAsk(null)
                  setToast('便籤已貼上')
                  setTimeout(() => setToast(null), 1400)
                })
              }}
            >
              確認貼上
            </button>
            <button type="button" className="ghost" onClick={() => setNoteAsk(null)}>
              換個位置
            </button>
          </div>
        </div>
      )}

      {noteAsk?.kind === 'manage' && managed && (
        <div className="modal">
          {editing ? (
            <>
              <p>編輯便籤</p>
              <textarea value={editText} maxLength={80} onChange={(e) => setEditText(e.target.value)} />
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    const text = editText.trim()
                    if (!text) return
                    emitUpdateNote(managed.id, text, managed.fontSize)
                    setEditing(false)
                    setNoteAsk(null)
                  }}
                >
                  儲存
                </button>
                <button type="button" className="ghost" onClick={() => setEditing(false)}>
                  返回
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {managed.author}：{managed.text}
              </p>
              <div className="modal-actions">
                {managed.authorId === selfId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditText(managed.text)
                      setEditing(true)
                    }}
                  >
                    編輯內容
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    emitRemoveNote(managed.id)
                    setNoteAsk(null)
                    setEditing(false)
                  }}
                >
                  拆除
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setNoteAsk(null)
                    setEditing(false)
                  }}
                >
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
