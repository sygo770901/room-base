import { isMobileDevice } from '../perf/device'
import { useAppStore } from '../store'
import { hudBlocksPointer, ignoreLockClickAttack, markPointerUnlocked, typingInField } from './inputLock'

export function exitGameLock() {
  if (typeof document === 'undefined') return
  if (document.pointerLockElement) document.exitPointerLock()
}

export function canRequestLock() {
  if (isMobileDevice()) return false
  const state = useAppStore.getState()
  if (state.phase !== 'room') return false
  if (state.matchOver) return false
  if ((state.mode === 'boss' || state.mode === 'tag') && !state.started) return false
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

export function bindPointerLockWatch() {
  const onChange = () => {
    const locked = Boolean(document.pointerLockElement)
    useAppStore.getState().setPointerLocked(locked)
    if (!locked) markPointerUnlocked()
  }
  document.addEventListener('pointerlockchange', onChange)
  document.addEventListener('pointerlockerror', onChange)
  return () => {
    document.removeEventListener('pointerlockchange', onChange)
    document.removeEventListener('pointerlockerror', onChange)
    exitGameLock()
  }
}
