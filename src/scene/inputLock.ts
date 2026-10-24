import { LOCK_CLICK_IGNORE_MS } from '../../shared/input'

let until = 0
let unlockedAt = 0

export function blockAttack(ms = 350) {
  until = performance.now() + ms
}

export function attackBlocked() {
  return performance.now() < until
}

export function markPointerUnlocked() {
  unlockedAt = performance.now()
}

export function pointerJustUnlocked(ms = 400) {
  return performance.now() - unlockedAt < ms
}

export function gameKeysBlocked(el: { tagName?: string; isContentEditable?: boolean } | null) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(el.isContentEditable)
}

export function typingInField() {
  return gameKeysBlocked(document.activeElement as HTMLElement | null)
}

export function hudBlocksPointer(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el?.closest) return false
  return Boolean(
    el.closest(
      'button, input, textarea, label, .hud-bottom, .hud-top, .note-panel, .joystick, .attack-btn, .hide-btn, .check-btn, .dash-btn, .skill-btn, .jump-btn, .door-btn, .phrase-btn, .phrase-menu, .rescue-btn, .respawn-btn, .downed-stack, .wait-card, .modal, .dock, .lobby, .sens-row',
    ),
  )
}

export function ignoreLockClickAttack() {
  blockAttack(LOCK_CLICK_IGNORE_MS)
}
