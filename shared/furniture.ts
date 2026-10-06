export type Vec3 = [number, number, number]

export interface FurnitureItem {
  id: string
  model: string
  position: Vec3
  rotationY: number
  scale: number
  color: string
  collider: [number, number] | null
  draggable: boolean
  pushable: boolean
  seat?: string
}

export const LAYOUT_VERSION = 4

/** 約 16m × 11m 公寓 */
export const ROOM_BOUNDS = { minX: -7.8, maxX: 7.8, minZ: -5.8, maxZ: 4.6 }
export const PLAYER_RADIUS = 0.26

export type WallBox = { cx: number; cz: number; hx: number; hz: number }

/**
 * 走廊牆留 1.6m 門：主臥門 x≈-5.2、次臥門 x≈0、客房門 x≈5.2
 * 客餐廳之間門在 z≈1.6
 */
export const INNER_WALLS: WallBox[] = [
  // 臥室前牆（z = -1.7），每房中間留門
  { cx: -6.95, cz: -1.7, hx: 0.85, hz: 0.08 },
  { cx: -3.85, cz: -1.7, hx: 1.05, hz: 0.08 },
  { cx: -1.7, cz: -1.7, hx: 0.9, hz: 0.08 },
  { cx: 1.7, cz: -1.7, hx: 0.9, hz: 0.08 },
  { cx: 3.85, cz: -1.7, hx: 1.05, hz: 0.08 },
  { cx: 6.95, cz: -1.7, hx: 0.85, hz: 0.08 },
  // 三房之間
  { cx: -2.6, cz: -3.75, hx: 0.08, hz: 1.95 },
  { cx: 2.6, cz: -3.75, hx: 0.08, hz: 1.95 },
  // 客廳 | 餐廳（中間留門）
  { cx: 0, cz: -0.15, hx: 0.08, hz: 1.35 },
  { cx: 0, cz: 3.15, hx: 0.08, hz: 1.25 },
]

function item(
  partial: Omit<FurnitureItem, 'pushable' | 'draggable'> &
    Partial<Pick<FurnitureItem, 'pushable' | 'draggable'>>,
): FurnitureItem {
  return {
    draggable: true,
    pushable: partial.collider != null,
    ...partial,
  }
}

/**
 * 典型三房兩廳：
 * 主臥（雙人床+衣櫃+床頭櫃）／次臥書房／客房
 * 客廳（沙發+茶几+電視）／餐廳（餐桌四椅+餐櫃）＋開放式廚房短櫃
 */
export const DEFAULT_FURNITURE: FurnitureItem[] = [
  // —— 主臥 ——
  item({ id: 'm-bed', model: 'bedDouble', position: [-5.2, 0, -4.35], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.95, 1.05], seat: 'masterBed' }),
  item({ id: 'm-wardrobe', model: 'bookcaseClosedWide', position: [-7.15, 0, -4.2], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: [0.28, 0.7] }),
  item({ id: 'm-night-l', model: 'cabinetBedDrawer', position: [-3.55, 0, -4.7], rotationY: 0, scale: 0.9, color: '#fff', collider: [0.22, 0.22] }),
  item({ id: 'm-lamp', model: 'lampRoundFloor', position: [-3.45, 0, -3.15], rotationY: 0, scale: 1, color: '#fff', collider: [0.16, 0.16] }),
  item({ id: 'm-dresser', model: 'cabinetBed', position: [-7.15, 0, -2.55], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: [0.28, 0.45] }),
  item({ id: 'm-rug', model: 'rugRectangle', position: [-5.2, 0.02, -3.9], rotationY: 0, scale: 1.3, color: '#fff', collider: null, pushable: false }),

  // —— 次臥（書房）——
  item({ id: 's-bed', model: 'bedSingle', position: [0.9, 0, -4.4], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.5, 0.95], seat: 'studyBed' }),
  item({ id: 's-desk', model: 'desk', position: [-1.35, 0, -2.55], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.65, 0.32], seat: 'studyDesk' }),
  item({ id: 's-chair', model: 'chairDesk', position: [-1.35, 0, -3.15], rotationY: 0, scale: 1, color: '#fff', collider: [0.24, 0.24], seat: 'studyChair' }),
  item({ id: 's-monitor', model: 'computerScreen', position: [-1.35, 0.74, -2.35], rotationY: Math.PI, scale: 1, color: '#fff', collider: null, pushable: false }),
  item({ id: 's-laptop', model: 'laptop', position: [-0.7, 0.74, -2.55], rotationY: 0.4, scale: 1, color: '#fff', collider: null, pushable: false }),
  item({ id: 's-shelf', model: 'bookcaseOpen', position: [1.9, 0, -2.7], rotationY: -Math.PI / 2, scale: 1, color: '#fff', collider: [0.22, 0.42] }),
  item({ id: 's-books', model: 'books', position: [1.85, 0.85, -2.55], rotationY: -Math.PI / 2, scale: 0.9, color: '#fff', collider: null, pushable: false }),
  item({ id: 's-lamp', model: 'lampSquareTable', position: [-1.9, 0.74, -2.5], rotationY: 0, scale: 1, color: '#fff', collider: null, pushable: false }),

  // —— 客房 ——
  item({ id: 'g-bed', model: 'bedSingle', position: [5.2, 0, -4.35], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.5, 0.95], seat: 'guestBed' }),
  item({ id: 'g-wardrobe', model: 'bookcaseClosed', position: [7.15, 0, -4.3], rotationY: -Math.PI / 2, scale: 1, color: '#fff', collider: [0.25, 0.4] }),
  item({ id: 'g-side', model: 'sideTable', position: [3.7, 0, -4.55], rotationY: 0, scale: 1, color: '#fff', collider: [0.22, 0.22] }),
  item({ id: 'g-lamp', model: 'lampRoundTable', position: [3.7, 0.55, -4.55], rotationY: 0, scale: 1, color: '#fff', collider: null, pushable: false }),
  item({ id: 'g-plant', model: 'plantSmall2', position: [3.6, 0, -2.6], rotationY: 0, scale: 1, color: '#fff', collider: [0.14, 0.14] }),
  item({ id: 'g-rug', model: 'rugRounded', position: [5.2, 0.02, -3.6], rotationY: 0, scale: 1.1, color: '#fff', collider: null, pushable: false }),

  // —— 客廳 ——
  item({ id: 'l-rug', model: 'rugRectangle', position: [-4.2, 0.02, 1.35], rotationY: 0, scale: 1.7, color: '#fff', collider: null, pushable: false }),
  item({ id: 'l-sofa', model: 'loungeSofaLong', position: [-6.7, 0, 1.3], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: [0.4, 1.05], seat: 'sofa' }),
  item({ id: 'l-chair', model: 'loungeChair', position: [-2.3, 0, 2.7], rotationY: -Math.PI / 2, scale: 1, color: '#fff', collider: [0.38, 0.38], seat: 'lounge' }),
  item({ id: 'l-coffee', model: 'tableCoffee', position: [-4.3, 0, 1.45], rotationY: 0, scale: 1, color: '#fff', collider: [0.5, 0.32] }),
  item({ id: 'l-tvstand', model: 'cabinetTelevision', position: [-7.15, 0, 1.2], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: [0.28, 0.55] }),
  item({ id: 'l-tv', model: 'televisionModern', position: [-6.85, 0.55, 1.2], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: null, pushable: false }),
  item({ id: 'l-speaker', model: 'speakerSmall', position: [-7.1, 0.55, 0.45], rotationY: 0, scale: 1, color: '#fff', collider: null, pushable: false }),
  item({ id: 'l-plant', model: 'pottedPlant', position: [-6.9, 0, 3.6], rotationY: 0, scale: 1, color: '#fff', collider: [0.22, 0.22] }),
  item({ id: 'l-coat', model: 'coatRackStanding', position: [-1.3, 0, 3.9], rotationY: 0, scale: 1, color: '#fff', collider: [0.18, 0.18] }),

  // —— 餐廳 + 短廚櫃 ——
  item({ id: 'd-rug', model: 'rugRound', position: [4.2, 0.02, 1.5], rotationY: 0, scale: 1.35, color: '#fff', collider: null, pushable: false }),
  item({ id: 'd-table', model: 'table', position: [4.2, 0, 1.55], rotationY: 0, scale: 1.05, color: '#fff', collider: [0.85, 0.5] }),
  item({ id: 'd-chair-n', model: 'chair', position: [4.2, 0, 0.55], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.22, 0.22], seat: 'dineN' }),
  item({ id: 'd-chair-s', model: 'chair', position: [4.2, 0, 2.55], rotationY: 0, scale: 1, color: '#fff', collider: [0.22, 0.22], seat: 'dineS' }),
  item({ id: 'd-chair-w', model: 'chair', position: [3.15, 0, 1.55], rotationY: Math.PI / 2, scale: 1, color: '#fff', collider: [0.22, 0.22], seat: 'dineW' }),
  item({ id: 'd-chair-e', model: 'chair', position: [5.25, 0, 1.55], rotationY: -Math.PI / 2, scale: 1, color: '#fff', collider: [0.22, 0.22], seat: 'dineE' }),
  item({ id: 'd-side', model: 'sideTableDrawers', position: [7.05, 0, 0.3], rotationY: -Math.PI / 2, scale: 1, color: '#fff', collider: [0.25, 0.4] }),
  item({ id: 'd-plant', model: 'plantSmall3', position: [6.6, 0, 3.5], rotationY: 0, scale: 1, color: '#fff', collider: [0.14, 0.14] }),
  item({ id: 'k-fridge', model: 'kitchenFridge', position: [2.2, 0, -1.05], rotationY: Math.PI, scale: 0.95, color: '#fff', collider: [0.35, 0.35] }),
  item({ id: 'k-counter', model: 'kitchenCabinet', position: [3.5, 0, -1.05], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.4, 0.32] }),
  item({ id: 'k-sink', model: 'kitchenSink', position: [4.7, 0, -1.05], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.4, 0.32] }),
  item({ id: 'k-stove', model: 'kitchenStove', position: [5.9, 0, -1.05], rotationY: Math.PI, scale: 1, color: '#fff', collider: [0.35, 0.32] }),
  item({ id: 'd-trash', model: 'trashcan', position: [7.1, 0, 3.5], rotationY: 0, scale: 1, color: '#fff', collider: [0.14, 0.14] }),
]
