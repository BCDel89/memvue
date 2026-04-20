import { useState } from 'react'
import type { MemoryEntry } from '../api/client'

const SKIP_META = new Set(['path', 'filename', 'consolidated_from', 'consolidated_at', 'stale', 'reviewed_at'])

export function isStale(m: MemoryEntry, thresholdDays = 90): boolean {
  if (m.metadata?.stale === 'true') return true
  const reviewedAt = m.metadata?.reviewed_at as string | undefined
  const lastActivity = reviewedAt || m.updated_at || m.created_at
  if (!lastActivity) return false
  const age = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
  return age > thresholdDays
}

export function memoryTags(m: MemoryEntry): [string, string][] {
  return Object.entries(m.metadata ?? {})
    .filter(([k]) => !SKIP_META.has(k))
    .map(([k, v]) => [k, String(v)])
}

interface Props {
  memory: MemoryEntry
  onDelete?: (m: MemoryEntry) => void
  onEdit?: (m: MemoryEntry) => void
  onMetadataUpdate?: (m: MemoryEntry, metadata: Record<string, unknown>) => Promise<void>
  highlight?: string
  activeTag?: [string, string] | null
  onTagClick?: (tag: [string, string]) => void
}

function sourceColor(source: string) {
  if (source === 'mem0') return 'bg-violet-900/60 text-violet-300 border-violet-700'
  if (source.startsWith('fs:')) return 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
  return 'bg-gray-800 text-gray-400 border-gray-700'
}

function highlightText(text: string, q: string) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    text.slice(0, idx) +
    `<mark class="bg-yellow-400/30 text-yellow-200 rounded px-0.5">${text.slice(idx, idx + q.length)}</mark>` +
    text.slice(idx + q.length)
  )
}

let _rowId = 0

export function MemoryCard({ memory, onDelete, onEdit, onMetadataUpdate, highlight = '', activeTag, onTagClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [flagging, setFlagging] = useState(false)

  const stale = isStale(memory)
  const [metaRows, setMetaRows] = useState<{ id: number; key: string; val: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const isLong = memory.content.length > 300
  const displayText = isLong && !expanded ? memory.content.slice(0, 300) + '…' : memory.content

  function copy() {
    navigator.clipboard.writeText(memory.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function openMetaEditor() {
    const rows = Object.entries(memory.metadata ?? {})
      .filter(([k]) => !SKIP_META.has(k))
      .map(([k, v]) => ({ id: _rowId++, key: k, val: String(v) }))
    setMetaRows(rows)
    setSaveError('')
    setEditingMeta(true)
  }

  function closeMetaEditor() {
    setEditingMeta(false)
    setSaveError('')
  }

  function addRow() {
    setMetaRows(r => [...r, { id: _rowId++, key: '', val: '' }])
  }

  function updateRow(id: number, field: 'key' | 'val', value: string) {
    setMetaRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  function deleteRow(id: number) {
    setMetaRows(r => r.filter(row => row.id !== id))
  }

  async function flagStale() {
    if (!onMetadataUpdate) return
    setFlagging(true)
    try {
      await onMetadataUpdate(memory, { ...memory.metadata, stale: 'true' })
    } finally {
      setFlagging(false)
    }
  }

  async function markReviewed() {
    if (!onMetadataUpdate) return
    setFlagging(true)
    try {
      const { stale: _s, ...rest } = memory.metadata as Record<string, unknown>
      void _s
      await onMetadataUpdate(memory, { ...rest, reviewed_at: new Date().toISOString() })
    } finally {
      setFlagging(false)
    }
  }

  async function saveMeta() {
    if (!onMetadataUpdate) return
    setSaving(true)
    setSaveError('')
    try {
      const systemMeta = Object.fromEntries(
        Object.entries(memory.metadata ?? {}).filter(([k]) => SKIP_META.has(k))
      )
      const userMeta = Object.fromEntries(
        metaRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.val])
      )
      await onMetadataUpdate(memory, { ...systemMeta, ...userMeta })
      setEditingMeta(false)
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const filename = memory.metadata?.filename as string | undefined
  const path = memory.metadata?.path as string | undefined
  const tags = memoryTags(memory)

  return (
    <div className="group relative rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sourceColor(memory.source)}`}>
            {memory.source === 'mem0' ? '⬡' : '⬢'} {memory.source}
          </span>
          {stale && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-900/50 text-amber-300 border-amber-700">
              stale
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={copy} className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400">
            {copied ? '✓' : 'copy'}
          </button>
          {onMetadataUpdate && stale && (
            <button
              onClick={markReviewed}
              disabled={flagging}
              className="px-2 py-1 text-xs rounded bg-amber-900/60 hover:bg-amber-800/60 disabled:opacity-40 text-amber-300 transition-colors"
              title="Mark as reviewed"
            >
              reviewed ✓
            </button>
          )}
          {onMetadataUpdate && !stale && (
            <button
              onClick={flagStale}
              disabled={flagging}
              className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-400 transition-colors"
              title="Flag as stale"
            >
              flag
            </button>
          )}
          {onMetadataUpdate && (
            <button
              onClick={editingMeta ? closeMetaEditor : openMetaEditor}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                editingMeta
                  ? 'bg-violet-900 text-violet-300'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
              }`}
            >
              tags
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(memory)} className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400">
              edit
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(memory)} className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300">
              delete
            </button>
          )}
        </div>
      </div>

      <p
        className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: highlightText(displayText, highlight) }}
      />

      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-gray-500 hover:text-gray-300">
          {expanded ? 'show less' : 'show more'}
        </button>
      )}

      {/* Inline metadata editor */}
      {editingMeta && (
        <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
          {metaRows.map(row => (
            <div key={row.id} className="flex gap-1.5 items-center">
              <input
                type="text"
                value={row.key}
                onChange={e => updateRow(row.id, 'key', e.target.value)}
                placeholder="key"
                className="w-28 shrink-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-violet-500 font-mono"
              />
              <span className="text-gray-600 text-xs">:</span>
              <input
                type="text"
                value={row.val}
                onChange={e => updateRow(row.id, 'val', e.target.value)}
                placeholder="value"
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-violet-500"
              />
              <button
                onClick={() => deleteRow(row.id)}
                className="text-gray-600 hover:text-red-400 px-1 text-sm leading-none"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={addRow}
            className="text-xs text-gray-500 hover:text-violet-400 transition-colors"
          >
            + add tag
          </button>

          {saveError && <p className="text-xs text-red-400">{saveError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={saveMeta}
              disabled={saving}
              className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={closeMetaEditor}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tag display (hidden while editing so changes are clear) */}
      {!editingMeta && tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map(([k, v]) => {
            const isActive = activeTag && activeTag[0] === k && activeTag[1] === v
            return (
              <button
                key={k}
                onClick={() => onTagClick?.([k, v])}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border
                  ${isActive
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-violet-600 hover:text-violet-300'
                  }`}
              >
                <span className="text-gray-500">{k}</span>
                <span>{v}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
        {filename && (
          <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-500" title={path}>{filename}</span>
        )}
        {memory.updated_at && (
          <span>{new Date(memory.updated_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  )
}
