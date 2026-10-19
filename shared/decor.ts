export type DecorItem = {
  x: number
  z: number
  rotY: number
  model: 'crate' | 'barrel' | 'bookcase' | 'chest' | 'pot' | 'banner' | 'table'
  scale?: number
}

/** 裝飾用，不是第 7 項可打破木桶、也不是藏身點。 */
export const ROOM_DECOR: Record<'warehouse' | 'library' | 'treasury' | 'throne', DecorItem[]> = {
  warehouse: [
    { x: 52, z: 14, rotY: 0.2, model: 'crate' },
    { x: 56, z: 12, rotY: -0.4, model: 'crate' },
    { x: 60, z: 13, rotY: 0.1, model: 'barrel' },
    { x: 100, z: 14, rotY: 0.6, model: 'barrel' },
    { x: 104, z: 12, rotY: -0.2, model: 'pot' },
    { x: 72, z: 12, rotY: 0, model: 'table' },
    { x: 88, z: 12, rotY: 0.3, model: 'crate' },
    { x: 50, z: 22, rotY: 1.2, model: 'pot' },
  ],
  library: [
    { x: 124, z: 74, rotY: 0, model: 'bookcase' },
    { x: 124, z: 80, rotY: 0, model: 'bookcase' },
    { x: 124, z: 86, rotY: 0, model: 'bookcase' },
    { x: 152, z: 74, rotY: Math.PI, model: 'bookcase' },
    { x: 152, z: 82, rotY: Math.PI, model: 'bookcase' },
    { x: 138, z: 72, rotY: 0.2, model: 'table' },
    { x: 144, z: 72, rotY: -0.1, model: 'pot' },
    { x: 130, z: 96, rotY: 0.4, model: 'barrel' },
  ],
  treasury: [
    { x: 124, z: 20, rotY: 0.2, model: 'chest' },
    { x: 128, z: 20, rotY: -0.3, model: 'chest' },
    { x: 148, z: 22, rotY: 0.8, model: 'banner' },
    { x: 124, z: 36, rotY: 0.1, model: 'pot' },
    { x: 130, z: 36, rotY: -0.2, model: 'crate' },
    { x: 146, z: 36, rotY: 0.4, model: 'chest' },
    { x: 150, z: 30, rotY: Math.PI / 2, model: 'banner' },
    { x: 136, z: 20, rotY: 0, model: 'table' },
  ],
  throne: [
    { x: 54, z: 108, rotY: 0.2, model: 'banner' },
    { x: 102, z: 108, rotY: -0.2, model: 'banner' },
    { x: 60, z: 122, rotY: 0, model: 'chest' },
    { x: 96, z: 122, rotY: 0.3, model: 'pot' },
    { x: 78, z: 122, rotY: 0, model: 'table' },
    { x: 140, z: 118, rotY: 0.4, model: 'banner' },
    { x: 148, z: 126, rotY: -0.5, model: 'chest' },
    { x: 128, z: 126, rotY: 0.1, model: 'pot' },
  ],
}

export const ALL_DECOR: DecorItem[] = [
  ...ROOM_DECOR.warehouse,
  ...ROOM_DECOR.library,
  ...ROOM_DECOR.treasury,
  ...ROOM_DECOR.throne,
]

export const DECOR_URL: Record<DecorItem['model'], string> = {
  crate: '/assets/kaykit/crate.gltf.glb',
  barrel: '/assets/kaykit/barrelDark.gltf.glb',
  bookcase: '/assets/kaykit/bookcaseFilled.gltf.glb',
  chest: '/assets/kaykit/chest_common.gltf.glb',
  pot: '/assets/kaykit/potA.gltf.glb',
  banner: '/assets/kaykit/banner.gltf.glb',
  table: '/assets/kaykit/tableMedium.gltf.glb',
}
