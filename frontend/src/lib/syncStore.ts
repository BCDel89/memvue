const PREFIX = 'memvue_sync'

export interface SyncRecord {
  hash: string
  synced_at: string
}

export function getSyncRecord(userId: string, path: string): SyncRecord | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}::${userId}::${path}`)
    return raw ? (JSON.parse(raw) as SyncRecord) : null
  } catch {
    return null
  }
}

export function setSyncRecord(userId: string, path: string, record: SyncRecord): void {
  try {
    localStorage.setItem(`${PREFIX}::${userId}::${path}`, JSON.stringify(record))
  } catch { /* storage full */ }
}
