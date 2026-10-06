import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_FURNITURE, LAYOUT_VERSION, type FurnitureItem } from '../shared/furniture.ts'
import type { StickyNote } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DATA_FILE = join(DATA_DIR, 'rooms.json')

export interface PersistedRoom {
  layoutVersion?: number
  notes: StickyNote[]
  furniture: FurnitureItem[]
  updatedAt: number
}

type Store = Record<string, PersistedRoom>

function ensureStore(): Store {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(DATA_FILE)) {
    const initial: Store = {}
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Store
  } catch {
    return {}
  }
}

let cache: Store = ensureStore()
let writeTimer: ReturnType<typeof setTimeout> | null = null

function flushSoon() {
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf-8')
  }, 250)
}

function normalizeFurniture(list: FurnitureItem[] | undefined, version?: number): FurnitureItem[] {
  if (!list?.length || version !== LAYOUT_VERSION) {
    return structuredClone(DEFAULT_FURNITURE)
  }
  return list.map((f) => ({
    ...f,
    pushable: f.pushable ?? f.collider != null,
    draggable: f.draggable ?? true,
  }))
}

export function loadPersistedRoom(roomId: string): PersistedRoom {
  const existing = cache[roomId]
  if (existing) {
    return {
      layoutVersion: LAYOUT_VERSION,
      notes: (existing.notes ?? []).map((n) => ({
        ...n,
        fontSize: n.fontSize ?? 0.12,
      })),
      furniture: normalizeFurniture(existing.furniture, existing.layoutVersion),
      updatedAt: existing.updatedAt ?? Date.now(),
    }
  }
  return {
    layoutVersion: LAYOUT_VERSION,
    notes: [],
    furniture: structuredClone(DEFAULT_FURNITURE),
    updatedAt: Date.now(),
  }
}

export function savePersistedRoom(roomId: string, data: Pick<PersistedRoom, 'notes' | 'furniture'>) {
  cache[roomId] = {
    layoutVersion: LAYOUT_VERSION,
    notes: data.notes,
    furniture: data.furniture,
    updatedAt: Date.now(),
  }
  flushSoon()
}
