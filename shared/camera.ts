/** 越肩鏡頭（先定，昱豪可改） */
export const OTS_DIST = 4.5
/**
 * 鏡頭偏到角色右肩外側的距離。
 * 角色面向 +Z 時右方是 -X。鏡頭站在這側，人會落在畫面左下；
 * 背對鏡頭，左肩（+X）比胸口更靠畫面左側，而且還在畫面裡。
 */
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
 * Three.js 畫面右方是 cross(up, eye-target)。肩偏移沿著這個右方，
 * 角色才會落在畫面左下，左肩在外側，準心從身體旁邊穿過去。
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
  // 畫面右側（Three.js）是 cross(up, 從目標指向鏡頭) = (-fz, fx)。鏡頭往這側挪，人就落在左側。
  const rx = -fz
  const rz = fx
  return {
    x: x + ox + rx * shoulder,
    y: y + oy,
    z: z + oz + rz * shoulder,
    aimX: x + fx * aimAhead,
    aimY: y,
    aimZ: z + fz * aimAhead,
  }
}
