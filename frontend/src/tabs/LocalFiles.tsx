import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import type { MemoryEntry, AdapterInfo } from '../api/client'
import { MemoryCard } from '../components/MemoryCard'
import { MemoryModal } from '../components/MemoryModal'

interface Props {
  adapters: AdapterInfo[]
  onStatsChange: () => void
}

export function LocalFiles({ adapters, onStatsChange }: Props) {
  const fsAdapters = adapters.filter(a => a.id.startsWith('fs:'))
  const [files, setFiles] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedAdapter, setSelectedAdapter] = useState<string>(fsAdapters[0]?.id ?? '')
  const [modal, setModal] = useState<{ open: boolean; editing?: MemoryEntry }>({ open: false })

  async function load() {
    if (!selectedAdapter) return
    setLoading(true)
    setError('')
    try {
      const data = await api.listMemories(selectedAdapter, 5000)
      setFiles(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedAdapter])

  const filtered = useMemo(() => {
    if (!filter) return files
    const q = filter.toLowerCase()
    return files.filter(f =>
      f.content.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      String(f.metadata?.filename ?? '').toLowerCase().includes(q)
    )
  }, [files, filter])

  async function handleDelete(m: MemoryEntry) {
    if (!confirm(`Delete ${m.metadata?.filename ?? m.id}?`)) return
    try {
      await api.delete(m.source, m.id)
      setFiles(prev => prev.filter(x => x.id !== m.id))
      onStatsChange()
    } catch (e) {
      alert(String(e))
    }
  }

  async function handleSave(content: string, adapterId: string) {
    if (modal.editing) {
      const updated = await api.update(modal.editing.source, modal.editing.id, content)
      setFiles(prev => prev.map(x => x.id === updated.id ? updated : x))
    } else {
      const created = await api.create(content, adapterId)
      setFiles(prev => [created, ...prev])
      onStatsChange()
    }
  }

  if (fsAdapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No filesystem adapters configured. Set <code className="mx-1 bg-gray-800 px-1 rounded">FS_ROOTS</code> in your .env.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-800">
        {fsAdapters.length > 1 && (
          <select
            value={selectedAdapter}
            onChange={e => setSelectedAdapter(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300 focus:outline-none"
          >
            {fsAdapters.map(a => <option key={a.id} value={a.id}>{a.id.replace('fs:', '')}</option>)}
          </select>
        )}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter files…"
          className="flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={() => setModal({ open: true })}
          className="px-3 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white"
        >
          + New file
        </button>
      </div>

      <div className="px-6 py-2 text-xs text-gray-600">
        {filtered.length.toLocaleString()} files
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        {loading && <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>}
        {error && <p className="text-sm text-red-400 py-4">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-600 py-8 text-center">No files found.</p>
        )}
        {filtered.map(f => (
          <MemoryCard
            key={f.id}
            memory={f}
            highlight={filter}
            onDelete={handleDelete}
            onEdit={f => setModal({ open: true, editing: f })}
          />
        ))}
      </div>

      {modal.open && (
        <MemoryModal
          memory={modal.editing}
          adapters={fsAdapters}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
