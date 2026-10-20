import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { dungeonModelUrls } from '../scene/Dungeon'
import { heroModelUrls } from '../scene/KayKitHero'
import { DUCK_URL } from '../scene/DuckKing'
import { useAppStore } from '../store'

export const MAP_LOAD_SLOW_MS = 8000

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

let preloadGen = 0

export function startCriticalPreload(scene: string) {
  const gen = ++preloadGen
  const urls = criticalModelUrls(scene)
  const total = Math.max(1, urls.length)
  let finished = 0
  THREE.Cache.enabled = true
  useAppStore.getState().setMapLoadProgress(0, true)
  useAppStore.getState().setMapLoadCounts(0, urls.length)
  useAppStore.getState().setMapLoadSlow(false)

  const tick = () => {
    if (gen !== preloadGen) return
    const pct = (finished / total) * 100
    useAppStore.getState().setMapLoadCounts(finished, urls.length)
    useAppStore.getState().setMapLoadProgress(pct, finished < total)
  }

  for (const url of urls) {
    useGLTF.preload(url)
    void fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.arrayBuffer()
      })
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
