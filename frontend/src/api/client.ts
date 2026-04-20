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

export interface Features {
  llm_configured: boolean
  llm_provider: string
  llm_model: string
  ai_ingest: boolean
  ai_tagging: boolean
  ai_digest: boolean
  consolidation: boolean
  duplicates: boolean
  staleness: boolean
  analytics: boolean
}

export interface LLMProvider {
  id: string
  label: string
  fields: string[]
}

export interface IngestCandidate {
  content: string
  metadata: Record<string, unknown>
}

export interface IngestResult {
  candidates: IngestCandidate[]
  count: number
}

export interface DuplicateEntry extends MemoryEntry {
  adapter_id: string
}

export interface DuplicatesResult {
  clusters: DuplicateEntry[][]
  count: number
}

export interface LLMConfig {
  provider: string
  base_url: string
  api_key: string
  model: string
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
  getMemory: (adapterId: string, memoryId: string) =>
    req<MemoryEntry>('GET', `/memories/${encodeURIComponent(memoryId)}?adapter_id=${encodeURIComponent(adapterId)}`),

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

  health: () => req<{
    status: string
    adapters: string[]
    default_user_id?: string
    agent_name?: string
    graph_entry_points?: string[]
    fs_extensions?: string[]
    fs_roots?: string[]
    llm?: { provider: string; base_url: string; model: string; has_api_key: boolean }
    support_url?: string
    version?: string
  }>('GET', '/health'),

  features: () => req<Features>('GET', '/features'),

  llmProviders: () => req<LLMProvider[]>('GET', '/llm/providers'),

  getLLMConfig: () => req<LLMConfig>('GET', '/config/llm'),

  saveLLMConfig: async (config: LLMConfig) => {
    const r = await req<{ ok: boolean; llm_configured: boolean }>('PATCH', '/config/llm', config)
    invalidateCache()
    return r
  },

  testLLM: () => req<{ ok: boolean; provider?: string; model?: string; error?: string | null }>('POST', '/llm/test'),

  duplicates: (threshold = 0.5, userId?: string) => {
    const params = new URLSearchParams({ threshold: String(threshold) })
    if (userId) params.set('user_id', userId)
    return req<DuplicatesResult>('GET', `/memories/duplicates?${params}`)
  },

  merge: async (keepId: string, keepAdapter: string, discardId: string, discardAdapter: string, mergedContent?: string) => {
    const r = await req<{ merged: boolean; kept: string; discarded: string }>('POST', '/memories/merge', {
      keep_id: keepId,
      keep_adapter: keepAdapter,
      discard_id: discardId,
      discard_adapter: discardAdapter,
      merged_content: mergedContent || undefined,
    })
    invalidateCache()
    return r
  },

  ingest: (content: string, url: string, adapter?: string, userId?: string) =>
    req<IngestResult>('POST', '/ingest/extract', { content, url, adapter, user_id: userId }),

  updateExtensions: async (extensions: string[]) => {
    const r = await req<{ ok: boolean; fs_extensions: string[]; fs_roots: string[] }>('PATCH', '/config', { fs_extensions: extensions })
    invalidateCache()
    return r
  },

  addFsRoot: async (path: string) => {
    const r = await req<{ ok: boolean; fs_roots: string[] }>('POST', '/config/fs-roots', { path })
    invalidateCache()
    return r
  },

  removeFsRoot: async (path: string) => {
    const r = await req<{ ok: boolean; fs_roots: string[] }>('DELETE', `/config/fs-roots?path=${encodeURIComponent(path)}`)
    invalidateCache()
    return r
  },

  exportMemories: async (format: 'json' | 'markdown-zip', userId?: string, adapter?: string) => {
    const params = new URLSearchParams({ format })
    if (userId) params.set('user_id', userId)
    if (adapter) params.set('adapter', adapter)
    const key = localStorage.getItem('memvue_api_key') || ''
    const res = await fetch(`${BASE}/export?${params}`, {
      headers: key ? { 'x-api-key': key } : {},
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    const blob = await res.blob()
    const filename = format === 'markdown-zip' ? 'memvue-export.zip' : 'memvue-export.json'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  importMemories: async (memories: object[], adapter?: string, userId?: string, skipDuplicates = true) => {
    const r = await req<{ imported: number; skipped: number; errors: number }>('POST', '/import', {
      memories,
      adapter,
      user_id: userId,
      skip_duplicates: skipDuplicates,
    })
    invalidateCache()
    return r
  },
}
