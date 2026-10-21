export const SCENE_IDS = ['kenney', 'kaykit', 'jungle', 'sample'] as const

export type SceneId = (typeof SCENE_IDS)[number]

export const SCENE_LABELS: Record<SceneId, string> = {
  kenney: 'Kenney 模組地城',
  kaykit: 'KayKit 地城',
  jungle: '叢林遺跡',
  sample: '寶物房樣本',
}

export const SCENE_BLURBS: Record<SceneId, string> = {
  kenney: '橙色地板與紫色石牆。',
  kaykit: '石磚、鐵柵與樓梯。',
  jungle: '叢林裡的遺跡通道。',
  sample: '寶物房、走廊、樓梯上到高台。',
}

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value)
}
