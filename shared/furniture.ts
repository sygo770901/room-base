export type Vec3 = [number, number, number]

export interface FurnitureItem {
  id: string
  model: string
  position: Vec3
  rotationY: number
  scale: number
  color: string
  /** 碰撞盒半寬 [hx, hz]，null = 可穿透 */
  collider: [number, number] | null
  draggable: boolean
  /** 可被角色推動 */
  pushable: boolean
  seat?: string
}

/** 佈局版本：舊存檔若版本不符會重置家具 */
export const LAYOUT_VERSION = 3

/** 公寓外牆包圍盒（角色／家具邊界） */
export const ROOM_BOUNDS = { minX: -7.6, maxX: 7.6, minZ: -5.6, maxZ: 4.6 }
export const PLAYER_RADIUS = 0.28

/** 內牆碰撞（半寬 hx, hz 的 AABB，中心在 cx,cz） */
export type WallBox = { cx: number; cz: number; hx: number; hz: number }

export const INNER_WALLS: WallBox[] = [
  // 臥室區橫向隔牆（客廳上方）
  { cx: -5.25, cz: -1.5, hx: 2.55, hz: 0.08 },
  { cx: 0, cz: -1.5, hx: 2.3, hz: 0.08 },
  { cx: 5.25, cz: -1.5, hx: 2.55, hz: 0.08 },
  // 三房之間直牆
  { cx: -2.6, cz: -3.55, hx: 0.08, hz: 1.95 },
  { cx: 2.6, cz: -3.55, hx: 0.08, hz: 1.95 },
  // 客廳 / 餐廳隔牆（留門口）
  { cx: 0, cz: -0.2, hx: 0.08, hz: 1.1 },
  { cx: 0, cz: 2.6, hx: 0.08, hz: 1.0 },
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
 * 三房兩廳佈局（俯視娃娃屋）
 * 上：主臥 / 次臥 / 客房
 * 下：客廳 + 餐廳
 */
export const DEFAULT_FURNITURE: FurnitureItem[] = [
  // —— 主臥（左上）——
  item({
    id: 'bed1',
    model: 'bedDouble',
    position: [-5.2, 0, -3.8],
    rotationY: Math.PI,
    scale: 1,
    color: '#9aa7b5',
    collider: [0.9, 1.1],
    seat: 'bed1',
  }),
  item({
    id: 'wardrobe1',
    model: 'bookcaseClosedWide',
    position: [-7.1, 0, -3.2],
    rotationY: Math.PI / 2,
    scale: 1,
    color: '#f7f5f0',
    collider: [0.3, 0.7],
  }),
  item({
    id: 'nightstand1',
    model: 'cabinetBedDrawer',
    position: [-3.7, 0, -4.5],
    rotationY: 0,
    scale: 1,
    color: '#f2f0ea',
    collider: [0.28, 0.28],
  }),
  item({
    id: 'lamp1',
    model: 'lampRoundFloor',
    position: [-3.5, 0, -2.4],
    rotationY: 0,
    scale: 1,
    color: '#d8d2c6',
    collider: [0.18, 0.18],
  }),

  // —— 次臥（中上）——
  item({
    id: 'bed2',
    model: 'bedSingle',
    position: [0, 0, -4.0],
    rotationY: Math.PI,
    scale: 1,
    color: '#a8b5c4',
    collider: [0.55, 1.0],
    seat: 'bed2',
  }),
  item({
    id: 'desk2',
    model: 'desk',
    position: [-1.4, 0, -2.3],
    rotationY: Math.PI,
    scale: 1,
    color: '#3f3a36',
    collider: [0.7, 0.35],
    seat: 'desk2',
  }),
  item({
    id: 'chair2',
    model: 'chairDesk',
    position: [-1.4, 0, -2.9],
    rotationY: 0,
    scale: 1,
    color: '#2f3338',
    collider: [0.28, 0.28],
    seat: 'chair2',
  }),
  item({
    id: 'book2',
    model: 'bookcaseOpen',
    position: [1.8, 0, -3.5],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#f5f2eb',
    collider: [0.25, 0.45],
  }),

  // —— 客房（右上）——
  item({
    id: 'bed3',
    model: 'bedSingle',
    position: [5.3, 0, -4.0],
    rotationY: Math.PI,
    scale: 1,
    color: '#b5a89a',
    collider: [0.55, 1.0],
    seat: 'bed3',
  }),
  item({
    id: 'wardrobe3',
    model: 'bookcaseClosedWide',
    position: [7.1, 0, -3.3],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#f7f5f0',
    collider: [0.3, 0.7],
  }),
  item({
    id: 'plant3',
    model: 'plantSmall2',
    position: [4.0, 0, -2.3],
    rotationY: 0,
    scale: 1,
    color: '#6f9b72',
    collider: [0.15, 0.15],
  }),

  // —— 客廳（左下）——
  item({
    id: 'rug-living',
    model: 'rugRectangle',
    position: [-4.0, 0.02, 1.0],
    rotationY: 0,
    scale: 1.8,
    color: '#7d8f9a',
    collider: null,
    pushable: false,
  }),
  item({
    id: 'sofa',
    model: 'loungeSofaLong',
    position: [-5.5, 0, 0.2],
    rotationY: Math.PI / 2,
    scale: 1,
    color: '#6b7c8a',
    collider: [0.45, 1.1],
    seat: 'sofa',
  }),
  item({
    id: 'sofa-chair',
    model: 'loungeChair',
    position: [-2.3, 0, 2.2],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#7a6b5d',
    collider: [0.4, 0.4],
    seat: 'sofaChair',
  }),
  item({
    id: 'coffee',
    model: 'tableCoffee',
    position: [-4.0, 0, 1.1],
    rotationY: 0,
    scale: 1,
    color: '#4a4038',
    collider: [0.55, 0.35],
  }),
  item({
    id: 'tv',
    model: 'televisionModern',
    position: [-2.0, 0, -0.8],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#1e2226',
    collider: [0.2, 0.5],
  }),
  item({
    id: 'plant-living',
    model: 'pottedPlant',
    position: [-7.0, 0, 2.8],
    rotationY: 0,
    scale: 1,
    color: '#6f9b72',
    collider: [0.25, 0.25],
  }),

  // —— 餐廳（右下）——
  item({
    id: 'rug-dining',
    model: 'rugRounded',
    position: [4.0, 0.02, 1.2],
    rotationY: 0,
    scale: 1.4,
    color: '#8a7b6a',
    collider: null,
    pushable: false,
  }),
  item({
    id: 'dining-table',
    model: 'table',
    position: [4.0, 0, 1.2],
    rotationY: 0,
    scale: 1.1,
    color: '#5c4e42',
    collider: [0.9, 0.55],
  }),
  item({
    id: 'dining-chair-a',
    model: 'chair',
    position: [4.0, 0, 0.2],
    rotationY: Math.PI,
    scale: 1,
    color: '#3a3330',
    collider: [0.25, 0.25],
    seat: 'dineA',
  }),
  item({
    id: 'dining-chair-b',
    model: 'chair',
    position: [4.0, 0, 2.2],
    rotationY: 0,
    scale: 1,
    color: '#3a3330',
    collider: [0.25, 0.25],
    seat: 'dineB',
  }),
  item({
    id: 'dining-chair-c',
    model: 'chair',
    position: [2.9, 0, 1.2],
    rotationY: Math.PI / 2,
    scale: 1,
    color: '#3a3330',
    collider: [0.25, 0.25],
    seat: 'dineC',
  }),
  item({
    id: 'dining-chair-d',
    model: 'chair',
    position: [5.1, 0, 1.2],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#3a3330',
    collider: [0.25, 0.25],
    seat: 'dineD',
  }),
  item({
    id: 'sideboard',
    model: 'cabinetTelevision',
    position: [7.0, 0, 0.5],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#efe8dc',
    collider: [0.3, 0.6],
  }),
  item({
    id: 'trash-dining',
    model: 'trashcan',
    position: [6.5, 0, 3.2],
    rotationY: 0,
    scale: 1,
    color: '#5c6168',
    collider: [0.15, 0.15],
  }),
]
