import { useState } from 'react'

const TUTORIAL_KEY = 'rb-tutorial-done'

export function Tutorial() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_KEY) !== '1'
    } catch {
      return true
    }
  })

  if (!open) return null

  function dismiss() {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1')
    } catch {
      /* ignore quota */
    }
    setOpen(false)
  }

  return (
    <div className="tutorial" role="dialog" aria-label="操作教學">
      <div className="tutorial-card">
        <h2>第一次來？先看這幾鍵</h2>
        <ul>
          <li>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            <span>移動（手機用左下搖桿）</span>
          </li>
          <li>
            <span>滑鼠</span>
            <span>轉動視角</span>
          </li>
          <li>
            <kbd>Alt</kbd>
            <span>顯示游標點按鈕，放開回到鎖定視角</span>
          </li>
          <li>
            <kbd>Space</kbd>
            <span>跳</span>
            <kbd>Shift</kbd>
            <span>衝刺</span>
          </li>
          <li>
            <kbd>F</kbd>
            <span>／左鍵攻擊</span>
            <kbd>右鍵</kbd>
            <span>技能</span>
          </li>
          <li>
            <kbd>E</kbd>
            <span>靠近門就開關門，否則躲藏</span>
          </li>
        </ul>
        <button type="button" className="tutorial-skip" onClick={dismiss}>
          略過
        </button>
      </div>
    </div>
  )
}
