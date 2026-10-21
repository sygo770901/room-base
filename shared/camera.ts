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
/** 高度圖沒有天花板，鏡頭再低一點，高台邊緣才不會整畫面變成天空。 */
export const OTS_HEIGHT_PHI = 1.05
export const OTS_HEIGHT_AIM = 4.5
export const OTS_HEIGHT_AIM_DROP = 1.1
export const OTS_LOOK_Y = 1.5
export const OTS_MIN_RADIUS = 2.5
export const OTS_MAX_RADIUS = 6
export const OTS_MIN_PULL = 1.5
/** 角色胸口。擋牆時用這點連到鏡頭，不連到更高的注視點，才不會從樓梯上方穿過去。 */
export const OTS_CHEST_Y = 1.05
/** 鏡頭要停在牆或樓梯表面前這麼遠，近裁面才不會埋進模型。 */
export const OTS_CAM_CLEARANCE = 0.32
export const OTS_FIT_MIN_RADIUS = 0.4
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

/**
 * 高度圖的想要距離。
 * localStorage 沒有這個鍵時 getItem 是 null，Number(null) 是 0，
 * 再被夾成最近距離。測試直接用 OTS_DIST，畫面卻一直停在最近距離。
 * 玩家沒調過鏡頭時，高度圖用越肩預設。平面地圖仍走 readCamDist。
 */
export function heightCamRadius(stored = readCamDist()) {
  if (typeof localStorage === 'undefined') return clampCamDist(stored)
  const raw = localStorage.getItem(CAM_DIST_KEY)
  if (raw == null || raw === '') return OTS_DIST
  return clampCamDist(Number(raw))
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
  aimDrop = 0,
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
    aimY: y - aimDrop,
    aimZ: z + fz * aimAhead,
  }
}

export type SegmentBlocked = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => boolean

/** 身體上的一點連到鏡頭，並再往外伸出一點餘裕。這段被擋住就代表鏡頭太貼牆。 */
export function shoulderViewBlocked(
  x: number,
  bodyY: number,
  z: number,
  pose: OtsPose,
  blocked: SegmentBlocked,
) {
  const dx = pose.x - x
  const dy = pose.y - bodyY
  const dz = pose.z - z
  const dist = Math.hypot(dx, dy, dz) || 1
  const scale = (dist + OTS_CAM_CLEARANCE) / dist
  return blocked(x, bodyY, z, x + dx * scale, bodyY + dy * scale, z + dz * scale)
}

/** 胸口和較低的身體點都要看得見，樓梯稜線才不會把人腰以下裁掉。 */
export function bodyViewBlocked(x: number, z: number, pose: OtsPose, bodyY: number[], blocked: SegmentBlocked) {
  return bodyY.some((y) => shoulderViewBlocked(x, y, z, pose, blocked))
}

/**
 * 在既有越肩取景裡找最遠的距離：角色仍在畫面左下、準心仍看向前方。
 * 牆或樓梯擋住胸口到鏡頭時，先縮距離、必要時再把肩偏移收一點。
 * 回傳的姿勢一定是 blocked 認為通的；縮短後的每一段都再檢查一次，避免二分搜到仍被擋住的距離。
 */
export function fitOtsCamera(opts: {
  x: number
  y: number
  z: number
  chestY: number
  /** 預設只看胸口。多傳髖部等較低的點，避免樓梯只露出頭。 */
  bodyY?: number[]
  theta: number
  phi: number
  radius: number
  shoulder?: number
  blocked: SegmentBlocked
}): { radius: number; shoulder: number; pose: OtsPose } {
  const wantShoulder = opts.shoulder ?? OTS_RIGHT
  const wantRadius = Math.max(OTS_FIT_MIN_RADIUS, opts.radius)
  const bodyY = opts.bodyY?.length ? opts.bodyY : [opts.chestY]
  // 肩偏移跟距離一起縮，走近時視線不會突然甩向旁邊，走路還是往前。
  const shoulderAt = (radius: number, scale: number) => wantShoulder * scale * (radius / wantRadius)
  const poseAt = (radius: number, scale: number) =>
    otsCamera(opts.x, opts.y, opts.z, opts.theta, opts.phi, radius, shoulderAt(radius, scale))
  const blockedAt = (radius: number, scale: number) =>
    bodyViewBlocked(opts.x, opts.z, poseAt(radius, scale), bodyY, opts.blocked)
  const largest = (scale: number) => {
    if (!blockedAt(wantRadius, scale)) return wantRadius
    if (blockedAt(OTS_FIT_MIN_RADIUS, scale)) return null
    let lo = OTS_FIT_MIN_RADIUS
    let hi = wantRadius
    for (let i = 0; i < 11; i++) {
      const mid = (lo + hi) / 2
      if (blockedAt(mid, scale)) hi = mid
      else lo = mid
    }
    if (!blockedAt(lo, scale)) return lo
    for (let i = 10; i >= 0; i--) {
      const radius = OTS_FIT_MIN_RADIUS + ((wantRadius - OTS_FIT_MIN_RADIUS) * i) / 10
      if (!blockedAt(radius, scale)) return radius
    }
    return null
  }
  for (const scale of [1, 0.65, 0.35, 0]) {
    const radius = largest(scale)
    if (radius == null) continue
    const shoulder = shoulderAt(radius, scale)
    return { radius, shoulder, pose: poseAt(radius, scale) }
  }
  return { radius: OTS_FIT_MIN_RADIUS, shoulder: 0, pose: poseAt(OTS_FIT_MIN_RADIUS, 0) }
}
