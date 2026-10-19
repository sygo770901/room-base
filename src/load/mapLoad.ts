import { useGLTF } from '@react-three/drei'
import { dungeonModelUrls } from '../scene/Dungeon'
import { useAppStore } from '../store'

export const MAP_LOAD_TIMEOUT_MS = 8000

export function asMapPercent(progress: number, loaded: number, total: number) {
  const fromRatio = progress > 0 && progress <= 1 ? progress * 100 : progress
  const fromCount = total > 0 ? (loaded / total) * 100 : 0
  const n = Math.max(fromRatio, fromCount)
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

export function reportMapProgress(progress: number, loaded: number, total: number, active: boolean, errors = 0) {
  const pct = asMapPercent(progress, loaded, total)
  if (errors > 0) useAppStore.getState().setMapLoadFailed(true)
  if (pct >= 99.5 && (!active || (total > 0 && loaded >= total))) {
    useAppStore.getState().setMapLoadProgress(100, false)
    return
  }
  useAppStore.getState().setMapLoadProgress(pct, true)
}

export function preloadSceneModels(scene: string) {
  for (const url of dungeonModelUrls(scene)) useGLTF.preload(url)
}

export function bindMapLoadWatchdog() {
  const started = performance.now()
  const id = window.setInterval(() => {
    const s = useAppStore.getState()
    if (!s.mapLoadActive) return
    if (performance.now() - started < MAP_LOAD_TIMEOUT_MS) return
    s.setMapLoadProgress(100, false)
  }, 250)
  return () => window.clearInterval(id)
}
