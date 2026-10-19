export const SCENE_IDS = ['kenney', 'kaykit', 'jungle'] as const

export type SceneId = (typeof SCENE_IDS)[number]

export const SCENE_LABELS: Record<SceneId, string> = {
  kenney: 'Kenney 模組地城',
  kaykit: 'KayKit 地城',
  jungle: '叢林遺跡',
}

export const SCENE_BLURBS: Record<SceneId, string> = {
  kenney: '現在這套。紫色石牆、橙色地板、柱子。',
  kaykit: '石磚貼圖、門、鐵柵、樓梯、天花板。面數是為手機準備的。',
  jungle: '平地叢林遺跡：沿用地城牆柱，加上樹木與岩石。高低差只有幾塊石頭平台。',
}

export function isSceneId(value: unknown): value is SceneId {
  return value === 'kenney' || value === 'kaykit' || value === 'jungle'
}
