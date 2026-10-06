import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_FURNITURE, type FurnitureItem } from '../shared/furniture.ts'
import type { StickyNote } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DATA_FILE = join(DATA_DIR, 'rooms.json')

export interface PersistedRoom {
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

export function loadPersistedRoom(roomId: string): PersistedRoom {
  const existing = cache[roomId]
  if (existing) {
    return {
      notes: existing.notes ?? [],
      furniture: existing.furniture?.length ? existing.furniture : structuredClone(DEFAULT_FURNITURE),
      updatedAt: existing.updatedAt ?? Date.now(),
    }
  }
  return {
    notes: [],
    furniture: structuredClone(DEFAULT_FURNITURE),
    updatedAt: Date.now(),
  }
}

export function savePersistedRoom(roomId: string, data: Pick<PersistedRoom, 'notes' | 'furniture'>) {
  cache[roomId] = {
    notes: data.notes,
    furniture: data.furniture,
    updatedAt: Date.now(),
  }
  flushSoon()
}
