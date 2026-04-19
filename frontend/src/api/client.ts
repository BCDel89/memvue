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

function headers(): Record<string, string> {
  const key = localStorage.getItem('memvue_api_key') || ''
  return key ? { 'x-api-key': key, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  listMemories: (adapter?: string, limit = 2000) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (adapter) params.set('adapter', adapter)
    return req<MemoryEntry[]>('GET', `/memories?${params}`)
  },

  search: (query: string, adapter?: string, top_k = 20) =>
    req<MemoryEntry[]>('POST', '/memories/search', { query, top_k, adapter }),

  create: (content: string, adapter?: string, metadata?: Record<string, unknown>) =>
    req<MemoryEntry>('POST', '/memories', { content, adapter, metadata }),

  update: (adapterId: string, memoryId: string, content: string, metadata?: Record<string, unknown>) =>
    req<MemoryEntry>('PUT', `/memories/${adapterId}/${memoryId}`, { content, metadata }),

  delete: (adapterId: string, memoryId: string) =>
    req<{ deleted: string }>('DELETE', `/memories/${adapterId}/${memoryId}`),

  adapters: () => req<AdapterInfo[]>('GET', '/adapters'),

  stats: (userId?: string) => req<Stats>('GET', `/stats${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`),

  health: () => req<{ status: string; adapters: string[] }>('GET', '/health'),
}
