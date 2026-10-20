import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { dungeonModelUrls } from '../scene/Dungeon'
import { heroModelUrls } from '../scene/KayKitHero'
import { DUCK_URL } from '../scene/DuckKing'
import { useAppStore } from '../store'

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

export function reportMapProgress(progress: number, loaded: number, total: number, active: boolean, errors: string[] = []) {
  const store = useAppStore.getState()
  for (const url of errors) {
    if (url) store.addMapLoadError(fileLabel(url))
  }
  if (total <= 0 && progress <= 0) return
  const pct = asMapPercent(progress, loaded, total)
  const failed = useAppStore.getState().mapLoadErrors.length > 0
  if (failed) useAppStore.getState().setMapLoadFailed(true)
  const done = !active && total > 0 && loaded >= total
  if (done) {
    useAppStore.getState().setMapLoadProgress(failed ? pct : 100, false)
    return
  }
  const current = useAppStore.getState().mapLoadProgress
  if (!useAppStore.getState().mapLoadActive && current >= 99.5) return
  useAppStore.getState().setMapLoadProgress(Math.max(current, pct), true)
}

export function startCriticalPreload(scene: string) {
  const urls = criticalModelUrls(scene)
  const total = Math.max(1, urls.length)
  let finished = 0
  let cancelled = false
  const loader = new GLTFLoader()
  const tick = () => {
    if (cancelled) return
    const pct = Math.min(100, (finished / total) * 100)
    useAppStore.getState().setMapLoadProgress(pct, finished < total)
  }
  useAppStore.getState().setMapLoadProgress(1, true)
  for (const url of urls) {
    useGLTF.preload(url)
    loader.load(
      url,
      () => {
        finished += 1
        tick()
      },
      undefined,
      () => {
        finished += 1
        useAppStore.getState().addMapLoadError(fileLabel(url))
        tick()
      },
    )
  }
  return () => {
    cancelled = true
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
