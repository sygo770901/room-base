import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'
import { hudBlocksPointer, ignoreLockClickAttack, markPointerUnlocked, typingInField } from './inputLock'

let altHeld = false
let pointerInWindow = true

export function isAltHeld() {
  return altHeld
}

export function isPointerInWindow() {
  return pointerInWindow
}

export function setPointerInWindow(on: boolean) {
  pointerInWindow = on
}

export function exitGameLock() {
  if (typeof document === 'undefined') return
  if (document.pointerLockElement) document.exitPointerLock()
}

export function canRequestLock() {
  if (isMobileDevice()) return false
  const state = useAppStore.getState()
  if (state.phase !== 'room') return false
  if (state.matchOver) return false
  if (state.pendingNote || state.noteAsk) return false
  if (typingInField()) return false
  return true
}

export function requestGameLock(canvas: HTMLElement, target: EventTarget | null) {
  if (!canRequestLock()) return
  if (hudBlocksPointer(target)) return
  if (document.pointerLockElement) return
  ignoreLockClickAttack()
  const req = canvas.requestPointerLock as typeof canvas.requestPointerLock
  try {
    const result = req.call(canvas)
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => undefined)
    }
  } catch {
    /* 瀏覽器拒絕鎖定時略過 */
  }
}

export function bindPointerLockWatch(canvas?: HTMLElement) {
  const onChange = () => {
    const locked = Boolean(document.pointerLockElement)
    useAppStore.getState().setPointerLocked(locked)
    if (!locked) markPointerUnlocked()
  }
  const onAltDown = (e: KeyboardEvent) => {
    if (e.code !== 'AltLeft' && e.code !== 'AltRight') return
    e.preventDefault()
    if (altHeld) return
    altHeld = true
    exitGameLock()
  }
  const onAltUp = (e: KeyboardEvent) => {
    if (e.code !== 'AltLeft' && e.code !== 'AltRight') return
    e.preventDefault()
    altHeld = false
    if (canvas && pointerInWindow) requestGameLock(canvas, canvas)
  }
  const onLeave = () => {
    pointerInWindow = false
  }
  const onEnter = () => {
    pointerInWindow = true
  }
  document.addEventListener('pointerlockchange', onChange)
  document.addEventListener('pointerlockerror', onChange)
  window.addEventListener('keydown', onAltDown)
  window.addEventListener('keyup', onAltUp)
  document.documentElement.addEventListener('mouseleave', onLeave)
  document.documentElement.addEventListener('mouseenter', onEnter)
  return () => {
    document.removeEventListener('pointerlockchange', onChange)
    document.removeEventListener('pointerlockerror', onChange)
    window.removeEventListener('keydown', onAltDown)
    window.removeEventListener('keyup', onAltUp)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    document.documentElement.removeEventListener('mouseenter', onEnter)
    altHeld = false
    exitGameLock()
  }
}
