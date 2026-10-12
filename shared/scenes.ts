export const SCENE_IDS = ['kenney', 'kaykit'] as const

export type SceneId = (typeof SCENE_IDS)[number]

export function isSceneId(value: unknown): value is SceneId {
  return value === 'kenney' || value === 'kaykit'
}
