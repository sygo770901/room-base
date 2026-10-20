import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { dungeonModelUrls } from '../scene/Dungeon'
import { heroModelUrls } from '../scene/KayKitHero'
import { DUCK_URL } from '../scene/DuckKing'
import { useAppStore } from '../store'

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
  return [...new Set([...dungeonModelUrls(scene), ...heroModelUrls(), DUCK_URL])]
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

export function startCriticalPreload(scene: string) {
  const gen = ++preloadGen
  const urls = criticalModelUrls(scene)
  const total = Math.max(1, urls.length)
  let finished = 0
  THREE.Cache.enabled = true
  const store = useAppStore.getState()
  store.setMapLoadFailed(false)
  store.setMapLoadSlow(false)
  store.setMapLoadCounts(0, urls.length)
  store.setMapLoadProgress(0, true)

  const tick = () => {
    if (gen !== preloadGen) return
    const pct = asMapPercent(0, finished, total)
    useAppStore.getState().setMapLoadCounts(finished, urls.length)
    useAppStore.getState().setMapLoadProgress(pct, finished < total)
    if (finished >= total) useAppStore.getState().setMapLoadProgress(100, false)
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
    if (useAppStore.getState().mapLoadActive) useAppStore.getState().setMapLoadSlow(true)
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
