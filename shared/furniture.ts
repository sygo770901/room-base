export type Vec3 = [number, number, number]

export type FurnitureId =
  | 'rug'
  | 'bed'
  | 'nightstand'
  | 'bookshelf'
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'laptop'
  | 'wardrobe'
  | 'lamp'
  | 'plant'
  | 'trash'

export interface FurnitureItem {
  id: FurnitureId
  model: string
  position: Vec3
  rotationY: number
  scale: number
  color: string
  /** 碰撞盒半寬 [hx, hz]，null = 可穿透（地毯等） */
  collider: [number, number] | null
  /** 是否可被房主拖曳 */
  draggable: boolean
  /** 座位對應（可選） */
  seat?: 'bed' | 'chair' | 'desk'
}

export const DEFAULT_FURNITURE: FurnitureItem[] = [
  {
    id: 'rug',
    model: 'rugRectangle',
    position: [0, 0.02, 0.15],
    rotationY: 0,
    scale: 1.35,
    color: '#7d8f9a',
    collider: null,
    draggable: true,
  },
  {
    id: 'bed',
    model: 'bedSingle',
    position: [0, 0, -1.2],
    rotationY: Math.PI,
    scale: 1,
    color: '#9aa7b5',
    collider: [0.55, 1.0],
    draggable: true,
    seat: 'bed',
  },
  {
    id: 'nightstand',
    model: 'cabinetBedDrawer',
    position: [-1.45, 0, -1.35],
    rotationY: Math.PI / 2,
    scale: 1,
    color: '#f2f0ea',
    collider: [0.28, 0.28],
    draggable: true,
  },
  {
    id: 'bookshelf',
    model: 'bookcaseOpen',
    position: [-2.05, 0, 0.15],
    rotationY: Math.PI / 2,
    scale: 1,
    color: '#f5f2eb',
    collider: [0.25, 0.45],
    draggable: true,
  },
  {
    id: 'desk',
    model: 'desk',
    position: [0.15, 0, 1.55],
    rotationY: Math.PI,
    scale: 1,
    color: '#3f3a36',
    collider: [0.7, 0.35],
    draggable: true,
    seat: 'desk',
  },
  {
    id: 'chair',
    model: 'chairDesk',
    position: [0.15, 0, 0.95],
    rotationY: Math.PI,
    scale: 1,
    color: '#2f3338',
    collider: [0.28, 0.28],
    draggable: true,
    seat: 'chair',
  },
  {
    id: 'monitor',
    model: 'computerScreen',
    position: [0.15, 0.72, 1.72],
    rotationY: Math.PI,
    scale: 1,
    color: '#1e2226',
    collider: null,
    draggable: true,
  },
  {
    id: 'laptop',
    model: 'laptop',
    position: [-0.3, 0.72, 1.5],
    rotationY: Math.PI * 0.9,
    scale: 1,
    color: '#555a60',
    collider: null,
    draggable: true,
  },
  {
    id: 'wardrobe',
    model: 'bookcaseClosedWide',
    position: [2.0, 0, -0.15],
    rotationY: -Math.PI / 2,
    scale: 1,
    color: '#f7f5f0',
    collider: [0.3, 0.7],
    draggable: true,
  },
  {
    id: 'lamp',
    model: 'lampRoundFloor',
    position: [-1.75, 0, -1.55],
    rotationY: 0,
    scale: 1,
    color: '#d8d2c6',
    collider: [0.18, 0.18],
    draggable: true,
  },
  {
    id: 'plant',
    model: 'plantSmall2',
    position: [1.55, 0, 1.45],
    rotationY: 0,
    scale: 1,
    color: '#6f9b72',
    collider: [0.15, 0.15],
    draggable: true,
  },
  {
    id: 'trash',
    model: 'trashcan',
    position: [1.0, 0, 1.5],
    rotationY: 0,
    scale: 1,
    color: '#5c6168',
    collider: [0.15, 0.15],
    draggable: true,
  },
]

export const ROOM_BOUNDS = { minX: -2.25, maxX: 2.25, minZ: -1.95, maxZ: 1.95 }
export const PLAYER_RADIUS = 0.28
