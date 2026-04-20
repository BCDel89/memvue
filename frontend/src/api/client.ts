export interface MemoryEntry {
  id: string
  content: string
  source: string
  metadata: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface AdapterInfo {
  id: string
  name: string
  capabilities: string[]
}

export interface Stats {
  total: number
  sources: Record<string, number>
  [key: string]: unknown
}

const BASE = '/api'
const CACHE_TTL = 30_000  // 30s
const cache = new Map<string, { ts: number; data: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

function headers(): Record<string, string> {
  const key = localStorage.getItem('memvue_api_key') || ''
  return key ? { 'x-api-key': key, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cacheable = method === 'GET'
  const cacheKey = `${method} ${path}`

  if (cacheable) {
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T
    const pending = inflight.get(cacheKey)
    if (pending) return pending as Promise<T>
  }

  const doFetch = (async () => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${res.status}: ${text}`)
    }
    const data = await res.json()
    if (cacheable) cache.set(cacheKey, { ts: Date.now(), data })
    return data as T
  })()

  if (cacheable) {
    inflight.set(cacheKey, doFetch)
    doFetch.finally(() => inflight.delete(cacheKey))
  }
  return doFetch
}

function invalidateCache() {
  cache.clear()
}

export const api = {
  listMemories: (adapter?: string, limit = 2000, userId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (adapter) params.set('adapter', adapter)
    if (userId) params.set('user_id', userId)
    return req<MemoryEntry[]>('GET', `/memories?${params}`)
  },

  search: (query: string, adapter?: string, top_k = 20, userId?: string) =>
    req<MemoryEntry[]>('POST', '/memories/search', { query, top_k, adapter, user_id: userId }),

  create: async (content: string, adapter?: string, metadata?: Record<string, unknown>) => {
    const r = await req<MemoryEntry>('POST', '/memories', { content, adapter, metadata })
    invalidateCache()
    return r
  },

  update: async (adapterId: string, memoryId: string, content: string, metadata?: Record<string, unknown>) => {
    const r = await req<MemoryEntry>('PUT', `/memories/${memoryId}?adapter_id=${encodeURIComponent(adapterId)}`, { content, metadata })
    invalidateCache()
    return r
  },

  delete: async (adapterId: string, memoryId: string) => {
    const r = await req<{ deleted: string }>('DELETE', `/memories/${memoryId}?adapter_id=${encodeURIComponent(adapterId)}`)
    invalidateCache()
    return r
  },

  adapters: () => req<AdapterInfo[]>('GET', '/adapters'),

  stats: (userId?: string) => req<Stats>('GET', `/stats${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`),

  health: () => req<{ status: string; adapters: string[]; default_user_id?: string; agent_name?: string; graph_entry_points?: string[] }>('GET', '/health'),
}
