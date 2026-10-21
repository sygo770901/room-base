export const SCENE_IDS = ['kenney', 'kaykit', 'jungle', 'heightlab'] as const

export type SceneId = (typeof SCENE_IDS)[number]

export const SCENE_LABELS: Record<SceneId, string> = {
  kenney: 'Kenney 模組地城',
  kaykit: 'KayKit 地城',
  jungle: '叢林遺跡',
  heightlab: '高度試驗',
}

export const SCENE_BLURBS: Record<SceneId, string> = {
  kenney: '橙色地板與紫色石牆。',
  kaykit: '石磚、鐵柵與樓梯。',
  jungle: '叢林裡的遺跡通道。',
  heightlab: '樓梯、高台，還有摔下去的斷崖。',
}

export function isSceneId(value: unknown): value is SceneId {
  return value === 'kenney' || value === 'kaykit' || value === 'jungle' || value === 'heightlab'
}
