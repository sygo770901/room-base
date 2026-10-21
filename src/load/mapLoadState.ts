export interface MapLoadView {
  active: boolean
  failed: boolean
  loaded: number
  total: number
  progress: number
  slow?: boolean
}

/** 檔案都到了就把進度卡關掉。之後就算 active 被打開，也不再蓋住畫面。 */
export function showMapLoadOverlay(view: MapLoadView) {
  if (view.failed) return false
  if (view.total > 0 && view.loaded >= view.total) return false
  return view.active
}

export function showMapLoadSlow(view: MapLoadView) {
  return Boolean(view.slow) && showMapLoadOverlay(view)
}

export function nextMapLoadOnEnter(
  prev: {
    phase: string
    scene: string
    mapLoadActive: boolean
    mapLoadFailed: boolean
    mapLoadLoaded: number
    mapLoadTotal: number
    mapLoadProgress: number
    mapLoadSlow: boolean
    mapLoadErrors: string[]
  },
  scene: string,
) {
  const sameScene = prev.phase === 'room' && prev.scene === scene
  const done = prev.mapLoadTotal > 0 && prev.mapLoadLoaded >= prev.mapLoadTotal && !prev.mapLoadFailed
  if (sameScene && done) {
    return {
      mapLoadActive: false,
      mapLoadSlow: false,
      mapLoadFailed: false,
      mapLoadErrors: prev.mapLoadErrors,
      mapLoadLoaded: prev.mapLoadLoaded,
      mapLoadTotal: prev.mapLoadTotal,
      mapLoadProgress: 100,
    }
  }
  if (sameScene) {
    return {
      mapLoadActive: true,
      mapLoadSlow: prev.mapLoadSlow,
      mapLoadFailed: false,
      mapLoadErrors: prev.mapLoadErrors,
      mapLoadLoaded: prev.mapLoadLoaded,
      mapLoadTotal: prev.mapLoadTotal,
      mapLoadProgress: prev.mapLoadProgress,
    }
  }
  return {
    mapLoadActive: true,
    mapLoadSlow: false,
    mapLoadFailed: false,
    mapLoadErrors: [] as string[],
    mapLoadLoaded: 0,
    mapLoadTotal: 0,
    mapLoadProgress: 0,
  }
}
