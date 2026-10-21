import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { DECOR_URL } from '../../shared/decor'
import { dungeonModelUrls } from '../scene/Dungeon'
import { heroModelUrls } from '../scene/KayKitHero'
import { showMapLoadOverlay } from './mapLoadState'
import { useAppStore } from '../store'

const BARREL_URL = '/assets/kaykit/barrel.gltf.glb'

export const MAP_LOAD_SLOW_MS = 8000
const FILE_TIMEOUT_MS = 10000

export function asMapPercent(progress: number, loaded: number, total: number) {
  const fromRatio = progress > 0 && progress <= 1 ? progress * 100 : progress
  const fromCount = total > 0 ? (loaded / total) * 100 : 0
  const n = Math.max(fromRatio, fromCount)
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

export function fileLabel(url: string) {
  const raw = String(url || '').split('?')[0]
  const assets = raw.indexOf('/assets/')
  if (assets >= 0) return raw.slice(assets)
  const draco = raw.indexOf('/draco/')
  if (draco >= 0) return raw.slice(draco)
  const parts = raw.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || raw
}

export function criticalModelUrls(scene: string) {
  return [...new Set([...dungeonModelUrls(scene), ...heroModelUrls()])]
}

/** 進房就要進快取的模型。揮擊只用這份，不會再臨時抓檔。 */
export function sceneAssetUrls(scene: string) {
  return [...new Set([...criticalModelUrls(scene), ...Object.values(DECOR_URL), BARREL_URL])]
}

function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res.arrayBuffer()
    })
    .finally(() => window.clearTimeout(timer))
}

let preloadGen = 0

export function startCriticalPreload(scene: string, clearCache = false) {
  const gen = ++preloadGen
  const urls = sceneAssetUrls(scene)
  if (clearCache) {
    for (const url of urls) {
      try {
        useGLTF.clear(url)
      } catch {
        /* 清快取失敗仍重抓 */
      }
      THREE.Cache.remove(url)
    }
  }
  const total = Math.max(1, urls.length)
  let finished = 0
  THREE.Cache.enabled = true
  const store = useAppStore.getState()
  store.setMapLoadFailed(false)
  store.setMapLoadSlow(false)
  store.setMapLoadCounts(0, urls.length)
  store.setMapLoadProgress(0, true)
  store.setMapSceneReady(false)

  const tick = () => {
    if (gen !== preloadGen) return
    const pct = asMapPercent(0, finished, total)
    const storeNow = useAppStore.getState()
    storeNow.setMapLoadCounts(finished, urls.length)
    const complete = finished >= total
    storeNow.setMapLoadProgress(complete ? 100 : pct, !complete)
    if (complete) storeNow.setMapLoadSlow(false)
  }

  for (const url of urls) {
    if (THREE.Cache.get(url)) {
      finished += 1
      continue
    }
    try {
      useGLTF.preload(url)
    } catch {
      /* 預載失敗仍走 fetch，最後用簡易模型 */
    }
    void fetchWithTimeout(url, FILE_TIMEOUT_MS)
      .then(() => {
        if (gen !== preloadGen) return
        finished += 1
        tick()
      })
      .catch(() => {
        if (gen !== preloadGen) return
        finished += 1
        useAppStore.getState().addMapLoadError(fileLabel(url))
        tick()
      })
  }
  tick()

  const slowId = window.setTimeout(() => {
    if (gen !== preloadGen) return
    const current = useAppStore.getState()
    if (showMapLoadOverlay({
      active: current.mapLoadActive,
      failed: current.mapLoadFailed,
      loaded: current.mapLoadLoaded,
      total: current.mapLoadTotal,
      progress: current.mapLoadProgress,
    })) {
      current.setMapLoadSlow(true)
    }
  }, MAP_LOAD_SLOW_MS)

  return () => {
    window.clearTimeout(slowId)
  }
}

export function bindLoadErrorWatch() {
  const mgr = THREE.DefaultLoadingManager
  const prev = mgr.onError
  mgr.onError = (url) => {
    const store = useAppStore.getState()
    store.addMapLoadError(fileLabel(url))
    store.setMapLoadFailed(true)
    prev?.(url)
  }
  return () => {
    mgr.onError = prev
  }
}
