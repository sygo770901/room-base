/** 越肩鏡頭（先定，昱豪可改） */
export const OTS_DIST = 4.5
export const OTS_RIGHT = 0.8
export const OTS_LOOK_Y = 1.2
export const OTS_MIN_RADIUS = 2.5
export const OTS_MAX_RADIUS = 6
export const OTS_MIN_PHI = 1.18
export const OTS_MAX_PHI = 1.42
export const CAM_DIST_KEY = 'rb-cam-dist'

export function clampCamDist(n: number) {
  if (!Number.isFinite(n)) return OTS_DIST
  return Math.min(OTS_MAX_RADIUS, Math.max(OTS_MIN_RADIUS, n))
}

export function readCamDist() {
  if (typeof localStorage === 'undefined') return OTS_DIST
  return clampCamDist(Number(localStorage.getItem(CAM_DIST_KEY)))
}
