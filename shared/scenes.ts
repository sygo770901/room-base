export const SCENE_IDS = ['kenney', 'kaykit', 'jungle', 'heightlab', 'sample'] as const

export type SceneId = (typeof SCENE_IDS)[number]

/** 高度試驗只給開發環境。正式大廳不列出，避免每張圖都被這張小測試圖蓋掉。 */
export function lobbySceneIds(dev = false): SceneId[] {
  if (dev) return [...SCENE_IDS]
  return SCENE_IDS.filter((id) => id !== 'heightlab')
}

/** 大廳按鈕對到場景 id。不在大廳清單裡的（含正式環境的 heightlab）回 null。 */
export function sceneIdForLobbyChoice(choice: string, dev = false): SceneId | null {
  const ids = lobbySceneIds(dev)
  if ((ids as string[]).includes(choice)) return choice as SceneId
  const byLabel = ids.find((id) => SCENE_LABELS[id] === choice)
  return byLabel ?? null
}

/** 這張場景實際要拼哪一套零件。jungle 沿用 KayKit 零件再加樹。 */
export function placeSetFor(scene: string): 'kenney' | 'kaykit' | 'heightlab' | 'sample' {
  if (scene === 'heightlab') return 'heightlab'
  if (scene === 'sample') return 'sample'
  if (scene === 'kaykit' || scene === 'jungle') return 'kaykit'
  return 'kenney'
}

export const SCENE_LABELS: Record<SceneId, string> = {
  kenney: 'Kenney 模組地城',
  kaykit: 'KayKit 地城',
  jungle: '叢林遺跡',
  heightlab: '高度試驗',
  sample: '寶物房樣本',
}

export const SCENE_BLURBS: Record<SceneId, string> = {
  kenney: '橙色地板與紫色石牆。',
  kaykit: '石磚、鐵柵與樓梯。',
  jungle: '叢林裡的遺跡通道。',
  heightlab: '樓梯、高台，摔下去還走得回出生點。',
  sample: '寶物房、走廊、樓梯上到高台。',
}

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value)
}
