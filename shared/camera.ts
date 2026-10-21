/** 越肩鏡頭（先定，昱豪可改） */
export const OTS_DIST = 4.5
/** 鏡頭在角色右肩外側，角色才會落在畫面左下，不會擋住畫面中央的準心。 */
export const OTS_RIGHT = 1.85
/** 注視點在角色前方，準心看的是前方空地，不是角色身體。 */
export const OTS_AIM_AHEAD = 7.5
/** 進房當下的俯角。越小鏡頭越高，角色越靠畫面下方。 */
export const OTS_ENTRY_PHI = 1.2
export const OTS_LOOK_Y = 1.5
export const OTS_MIN_RADIUS = 2.5
export const OTS_MAX_RADIUS = 6
export const OTS_MIN_PULL = 1.5
export const OTS_MIN_PHI = 1.18
export const OTS_MAX_PHI = 1.42
export const OTS_CEILING_Y = 2.85
export const CAM_DIST_KEY = 'rb-cam-dist'

export function clampCamDist(n: number) {
  if (!Number.isFinite(n)) return OTS_DIST
  return Math.min(OTS_MAX_RADIUS, Math.max(OTS_MIN_RADIUS, n))
}

export function readCamDist() {
  if (typeof localStorage === 'undefined') return OTS_DIST
  return clampCamDist(Number(localStorage.getItem(CAM_DIST_KEY)))
}

/** 角色面向 +π，鏡頭在背後。 */
export function otsThetaFromFacing(rotationY: number) {
  return rotationY + Math.PI
}

export interface OtsPose {
  x: number
  y: number
  z: number
  aimX: number
  aimY: number
  aimZ: number
}

/**
 * 鏡頭在錨點的右後上方，注視錨點前方。
 * 錨點是角色胸口；準心射線因此從身體右側擦過，角色落在畫面左下。
 */
export function otsCamera(
  x: number,
  y: number,
  z: number,
  theta: number,
  phi: number,
  radius: number,
  shoulder = OTS_RIGHT,
  aimAhead = OTS_AIM_AHEAD,
): OtsPose {
  const sinPhi = Math.sin(phi)
  const ox = radius * sinPhi * Math.sin(theta)
  const oy = radius * Math.cos(phi)
  const oz = radius * sinPhi * Math.cos(theta)
  const horiz = Math.hypot(ox, oz) || 1
  const fx = -ox / horiz
  const fz = -oz / horiz
  const rx = fz
  const rz = -fx
  return {
    x: x + ox + rx * shoulder,
    y: y + oy,
    z: z + oz + rz * shoulder,
    aimX: x + fx * aimAhead,
    aimY: y,
    aimZ: z + fz * aimAhead,
  }
}
