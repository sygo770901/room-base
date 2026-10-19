import { FormEvent, useEffect, useState } from 'react'
import { LOOK_SENS_MAX, LOOK_SENS_MIN, LOOK_SENS_STEP } from '../../shared/input'
import { disconnectSocket, emitAddNote, emitCheck, emitDoorToggle, emitHide, emitRemoveNote, emitRestart, emitScene, emitStart, emitUpdateNote, performAttack } from '../net/socket'
import { SCENE_IDS, SCENE_LABELS } from '../../shared/scenes'
import { setMicEnabled } from '../net/voice'
import { isMobileDevice } from '../perf/device'
import { exitGameLock } from '../scene/pointerLock'
import { useAppStore } from '../store'
import { VirtualJoystick } from './VirtualJoystick'
import { Minimap } from './Minimap'
import { nearestDoor, DOOR_RANGE } from '../../shared/doors'

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
  const sfxOn = useAppStore((s) => s.sfxOn)
  const setSfxOn = useAppStore((s) => s.setSfxOn)
  const setToast = useAppStore((s) => s.setToast)
  const setPendingNote = useAppStore((s) => s.setPendingNote)
  const setNoteAsk = useAppStore((s) => s.setNoteAsk)
  const self = selfId ? players[selfId] : null
  const mode = useAppStore((s) => s.mode)
  const scene = useAppStore((s) => s.scene)
  const matchOver = useAppStore((s) => s.matchOver)
  const monsters = useAppStore((s) => s.monsters)
  const timeLeftMs = useAppStore((s) => s.timeLeftMs)
  const hostId = useAppStore((s) => s.hostId)
  const startInMs = useAppStore((s) => s.startInMs)
  const started = useAppStore((s) => s.started)
  const tagHud = useAppStore((s) => s.tagHud)
  const lookSensitivity = useAppStore((s) => s.lookSensitivity)
  const setLookSensitivity = useAppStore((s) => s.setLookSensitivity)
  const pointerLocked = useAppStore((s) => s.pointerLocked)
  const dashReadyAt = useAppStore((s) => s.dashReadyAt)
  const requestDash = useAppStore((s) => s.requestDash)
  const requestJump = useAppStore((s) => s.requestJump)
  const [dashLeft, setDashLeft] = useState(0)
  const smokeReadyAt = useAppStore((s) => s.smokeReadyAt)
  const requestSmoke = useAppStore((s) => s.requestSmoke)
  const [smokeLeft, setSmokeLeft] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())
  const [note, setNote] = useState('')
  const [clock, setClock] = useState(timeLeftMs)
  const [countMs, setCountMs] = useState(startInMs)
  const [goFlash, setGoFlash] = useState(false)
  const [hideLeft, setHideLeft] = useState(0)
  const [playLeft, setPlayLeft] = useState<number | null>(null)
  const [checkLeft, setCheckLeft] = useState(0)
  const [fontSize, setFontSize] = useState(0.12)

  useEffect(() => {
    if (pendingNote || noteAsk) exitGameLock()
  }, [pendingNote, noteAsk])

  useEffect(() => {
    const tick = () => setDashLeft(Math.max(0, dashReadyAt - Date.now()))
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [dashReadyAt])

  useEffect(() => {
    const tick = () => setSmokeLeft(Math.max(0, smokeReadyAt - Date.now()))
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [smokeReadyAt])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (matchOver || ((mode === 'boss' || mode === 'tag') && !started)) exitGameLock()
  }, [matchOver, mode, started])

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

  useEffect(() => {
    if (!tagHud) {
      setHideLeft(0)
      setPlayLeft(null)
      setCheckLeft(0)
      return
    }
    const origin = Date.now()
    const hideBase = tagHud.hideLeftMs
    const playBase = tagHud.playLeftMs
    const checkBase = tagHud.nextCheckMs
    setHideLeft(hideBase)
    setPlayLeft(playBase)
    setCheckLeft(checkBase)
    const id = window.setInterval(() => {
      const elapsed = Date.now() - origin
      setHideLeft(Math.max(0, hideBase - elapsed))
      setPlayLeft(playBase == null ? null : Math.max(0, playBase - elapsed))
      setCheckLeft(Math.max(0, checkBase - elapsed))
    }, 100)
    return () => window.clearInterval(id)
  }, [tagHud])
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
          {mode === 'boss' ? ' · 打鴨王' : mode === 'tag' ? ' · 鬼抓人' : ' · 地城狩獵'}
          {` · ${SCENE_LABELS[scene] ?? scene}`}
          {pendingNote ? ' · 點地板貼便籤中' : ''}
          {mode === 'tag' && self?.team ? ` · ${self.team === 'ghost' ? '鬼' : self.team === 'hider' ? '躲的人' : '觀戰'}` : ''}
          {mode === 'tag' && tagHud?.roundActive ? ` · 還有 ${tagHud.hidersLeft} 人沒被抓` : ''}
          {mode === 'tag' && playLeft != null && playLeft > 0 && !matchOver && (
            <span className={playLeft <= 30_000 ? 'time-low' : ''}>
              {' '}
              · {Math.floor(playLeft / 60000)}:{String(Math.floor((playLeft % 60000) / 1000)).padStart(2, '0')}
            </span>
          )}
          {mode === 'boss' && clock != null && clock > 0 && !matchOver && (
            <span className={clock <= 30_000 ? 'time-low' : ''}>
              {' '}
              · {Math.floor(clock / 60000)}:{String(Math.floor((clock % 60000) / 1000)).padStart(2, '0')}
            </span>
          )}
          <div className="hp-bar" title="生命">
            <span style={{ width: `${Math.max(0, Math.min(100, self?.hp ?? 100))}%` }} />
          </div>
          {self?.weapon && self.weapon !== 'sword' && (self.weaponUntil ?? 0) > nowMs && (
            <span className="weapon-pill">
              {self.weapon === 'dagger' ? '匕首' : '大鎚'} · {Math.max(1, Math.ceil(((self.weaponUntil ?? 0) - nowMs) / 1000))}s
            </span>
          )}
        </div>
        <div className="hud-top-right">
          {mode === 'boss' && <Minimap />}
          <div className="pill player-list">
            {Object.values(players).map((p) => (
              <div className="player-row" key={p.id}>
                <span className="dot" style={{ background: p.color }} />
                <span>
                  {p.name}
                  {p.id === selfId ? '（你）' : ''}
                  {p.hp != null && p.hp < 100 ? ` · ${p.hp}` : ''}
                  {p.team === 'ghost' ? ' · 鬼' : p.team === 'spectator' ? ' · 觀戰' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {(mode === 'boss' || mode === 'tag') && !started && !matchOver && (
        <div className="modal match-over">
          <p>等房主開始</p>
          <p className="modal-preview">
            {mode === 'tag'
              ? `至少 2 人才能開局。現在 ${Object.values(players).filter((p) => p.team !== 'spectator').length} 人。`
              : '按下開始後會倒數 5 秒，鴨王血量依當時人數計算。'}
          </p>
          {selfId && hostId === selfId ? (
            <button
              type="button"
              className="restart-btn"
              disabled={mode === 'tag' && Object.values(players).filter((p) => p.team !== 'spectator').length < 2}
              onClick={() => emitStart()}
            >
              開始
            </button>
          ) : (
            <p className="modal-preview">等房主按開始</p>
          )}
        </div>
      )}

      {mode === 'tag' && self?.team === 'ghost' && hideLeft > 0 && !matchOver && (
        <div className="ghost-blackout" aria-live="polite">
          {Math.max(1, Math.ceil(hideLeft / 1000))} 秒後出發
        </div>
      )}

      {mode === 'boss' && started && !matchOver && countMs > 0 && (
        <div className="countdown-banner" aria-live="polite">
          {Math.max(1, Math.ceil(countMs / 1000))}
        </div>
      )}
      {mode === 'boss' && started && !matchOver && goFlash && countMs <= 0 && (
        <div className="countdown-banner go">開打！</div>
      )}
      {mode === 'boss' && started && !matchOver && countMs <= 0 && !goFlash && (
        <div className="boss-hint">鴨大王在東南王房</div>
      )}

      {mode === 'boss' && started && !matchOver && (
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
          <p>
            {matchOver.winner === 'ghosts'
              ? '鬼贏'
              : matchOver.winner === 'hiders'
                ? '躲的人贏'
                : matchOver.teamWin
                  ? '全隊勝利'
                  : '全隊失敗'}
          </p>
          <p className="modal-preview">
            {matchOver.winner
              ? matchOver.winner === 'ghosts'
                ? '所有人都被抓到了。'
                : '時間到，還有人沒被抓到。'
              : matchOver.reason === 'timeout'
                ? '時間到，鴨大王還活著。'
                : '全隊打倒了鴨大王與飲水機。'}
          </p>
          <ol className="rank-list">
            {(matchOver.ranking ?? []).map((row, i) => (
              <li key={row.id} className={i === 0 ? 'rank-first' : ''}>
                {i === 0 ? '第一名 · ' : ''}
                {row.name}
                {matchOver.winner
                  ? row.team === 'ghost' || (row.catches ?? 0) > 0
                    ? `　抓到 ${row.catches ?? row.dmg} 人`
                    : `　存活 ${row.surviveSec ?? row.dmg} 秒`
                  : `　${row.dmg}`}
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

      {!matchOver && started && self?.team !== 'spectator' && (
        <button type="button" className="attack-btn" onClick={() => performAttack()}>
          攻擊
        </button>
      )}
      {!matchOver && started && self?.team !== 'spectator' && (
        <button
          type="button"
          className="dash-btn"
          disabled={dashLeft > 0}
          onClick={() => requestDash()}
        >
          {dashLeft > 0 ? `${Math.ceil(dashLeft / 1000)}` : '衝'}
        </button>
      )}
      {!matchOver && started && self?.team !== 'spectator' && (
        <button type="button" className="jump-btn" onClick={() => requestJump()}>
          跳
        </button>
      )}
      {!matchOver && started && self?.team !== 'spectator' && (
        <button
          type="button"
          className="skill-btn"
          disabled={smokeLeft > 0}
          onClick={() => requestSmoke()}
        >
          {smokeLeft > 0 ? `${Math.ceil(smokeLeft / 1000)}` : '技'}
        </button>
      )}
      {!matchOver && started && self && self.team !== 'ghost' && self.team !== 'spectator' && (
        <button
          type="button"
          className="hide-btn"
          onClick={() => emitHide(!self.hidden)}
        >
          {self.hidden ? '出來' : '躲'}
        </button>
      )}
      {!matchOver && started && self?.team !== 'spectator' && self?.position && nearestDoor(self.position[0], self.position[2], DOOR_RANGE) && (
        <button type="button" className="door-btn" onClick={() => emitDoorToggle()}>
          門
        </button>
      )}
      {!matchOver && started && mode === 'tag' && self?.team === 'ghost' && hideLeft <= 0 && (
        <button type="button" className="check-btn" disabled={checkLeft > 0} onClick={() => emitCheck()}>
          {checkLeft > 0 ? `${Math.ceil(checkLeft / 1000)}` : '檢查'}
        </button>
      )}

      <div className="dock">
        <button type="button" className="hud-btn" onClick={() => void toggleMic()} disabled={busyMic}>
          {micOn ? '語音開' : '語音關'}
        </button>
        <button type="button" className="hud-btn" onClick={() => setSfxOn(!sfxOn)}>
          {sfxOn ? '手感開' : '手感關'}
        </button>
        {!isMobileDevice() && (
          <label className="sens-row">
            靈敏 {lookSensitivity.toFixed(1)}
            <input
              type="range"
              min={LOOK_SENS_MIN}
              max={LOOK_SENS_MAX}
              step={LOOK_SENS_STEP}
              value={lookSensitivity}
              onPointerDown={() => exitGameLock()}
              onChange={(e) => setLookSensitivity(Number(e.target.value))}
            />
          </label>
        )}
        {self?.role === 'host' && (!(mode === 'boss' || mode === 'tag') || !started || Boolean(matchOver)) && (
          <div className="map-host" role="radiogroup" aria-label="地圖">
            {SCENE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={scene === id ? 'hud-btn on' : 'hud-btn'}
                disabled={scene === id}
                onClick={() => emitScene(id)}
              >
                {SCENE_LABELS[id]}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="hud-btn" onClick={() => disconnectSocket()}>
          離開
        </button>
      </div>

      <div className="hud-bottom">
        <div className="help">
          WASD／搖桿移動 · 電腦點畫面鎖定滑鼠轉視角（Esc 解除{pointerLocked ? ' · 已鎖定' : ''}）· 手機單指拖曳 · 滾輪／雙指縮放
          <br />
          鎖定後左鍵、F 或攻擊鈕揮劍 · 右鍵留給技能 · E 靠近門 1.5 內優先開關門，否則躲藏
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
            onFocus={() => exitGameLock()}
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
              <textarea
                value={editText}
                maxLength={80}
                onChange={(e) => setEditText(e.target.value)}
                onFocus={() => exitGameLock()}
              />
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
