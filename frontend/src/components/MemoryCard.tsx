import { useState } from 'react'
import type { MemoryEntry } from '../api/client'

interface Props {
  memory: MemoryEntry
  onDelete?: (m: MemoryEntry) => void
  onEdit?: (m: MemoryEntry) => void
  highlight?: string
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

export function MemoryCard({ memory, onDelete, onEdit, highlight = '' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const isLong = memory.content.length > 300
  const displayText = isLong && !expanded ? memory.content.slice(0, 300) + '…' : memory.content

  function copy() {
    navigator.clipboard.writeText(memory.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const filename = memory.metadata?.filename as string | undefined
  const path = memory.metadata?.path as string | undefined

  return (
    <div className="group relative rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sourceColor(memory.source)}`}>
          {memory.source === 'mem0' ? '⬡' : '⬢'} {memory.source}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={copy} className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400">
            {copied ? '✓' : 'copy'}
          </button>
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

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
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
