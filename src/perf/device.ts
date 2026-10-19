import { MOBILE_MAX_DPR } from '../../shared/perf'

export function isMobileDevice() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true
  if (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches) return true
  return false
}

export function canvasDpr(mobile: boolean): [number, number] {
  return mobile ? [1, MOBILE_MAX_DPR] : [1, 2]
}
