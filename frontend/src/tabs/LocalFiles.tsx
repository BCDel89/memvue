import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import type { MemoryEntry, AdapterInfo } from '../api/client'
import { MemoryCard, memoryTags } from '../components/MemoryCard'
import { MemoryModal } from '../components/MemoryModal'
import { Loading } from '../components/Loading'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'

function shortSource(src: string): string {
  if (src.startsWith('fs:')) {
    const seg = src.replace('fs:', '').split('/').filter(Boolean).pop() ?? src
    return `fs:${seg}`
  }
  return src
}

type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest' | 'az' | 'za'

interface Props {
  adapters: AdapterInfo[]
  userId: string
  onStatsChange: () => void
}

export function LocalFiles({ adapters, userId, onStatsChange }: Props) {
  const fsAdapters = adapters.filter(a => a.id.startsWith('fs:'))
  const [files, setFiles] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [activeTag, setActiveTag] = useState<[string, string] | null>(null)
  const [modal, setModal] = useState<{ open: boolean; editing?: MemoryEntry }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  async function load() {
    if (!fsAdapters.length) return
    setLoading(true)
    setError('')
    try {
      const lists = await Promise.all(fsAdapters.map(a => api.listMemories(a.id, 5000, userId)))
      setFiles(lists.flat())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId, adapters])

  const sources = useMemo(() =>
    ['all', ...Array.from(new Set(files.map(f => f.source)))],
    [files]
  )

  const filtered = useMemo(() => {
    let list = files
    if (sourceFilter !== 'all') list = list.filter(f => f.source === sourceFilter)
    if (activeTag) list = list.filter(f =>
      memoryTags(f).some(([k, v]) => k === activeTag[0] && v === activeTag[1])
    )
    if (filter) {
      const q = filter.toLowerCase()
      list = list.filter(f =>
        f.content.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        String(f.metadata?.filename ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'newest':   return (b.created_at ?? '').localeCompare(a.created_at ?? '')
        case 'oldest':   return (a.created_at ?? '').localeCompare(b.created_at ?? '')
        case 'longest':  return b.content.length - a.content.length
        case 'shortest': return a.content.length - b.content.length
        case 'az':       return a.content.localeCompare(b.content)
        case 'za':       return b.content.localeCompare(a.content)
      }
    })
  }, [files, filter, sort, sourceFilter, activeTag])

  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0) + (activeTag ? 1 : 0)

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await api.delete(deleteTarget.source, deleteTarget.id)
      setFiles(prev => prev.filter(x => x.id !== deleteTarget.id))
      onStatsChange()
    } catch (e) {
      alert(String(e))
    } finally {
      setDeleteTarget(null)
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

  if (!fsAdapters.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No filesystem adapters configured. Set <code className="mx-1 bg-gray-800 px-1 rounded">FS_ROOTS</code> in your .env.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 border-b border-gray-800">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter files…"
          className="flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 sm:py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
        />

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-300 focus:outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="longest">Longest</option>
          <option value="shortest">Shortest</option>
          <option value="az">A→Z</option>
          <option value="za">Z→A</option>
        </select>

        {/* filter toggle — mobile only */}
        {sources.length > 2 && (
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`sm:hidden relative px-2.5 py-1.5 rounded-lg border text-sm transition-colors
              ${showFilters || activeFilterCount > 0
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400'}`}
            title="Filters"
          >
            ⊞
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-500 text-white text-[10px] flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setModal({ open: true })}
          className="px-3 py-1.5 sm:py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white whitespace-nowrap"
        >
          + New file
        </button>
      </div>

      {/* filter panel */}
      <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-col`}>
        {sources.length > 2 && (
          <div className="flex gap-2 px-3 sm:px-6 py-2 border-b border-gray-800 overflow-x-auto">
            {sources.map(s => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                title={s}
                className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap
                  ${sourceFilter === s
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
              >
                {shortSource(s)}
              </button>
            ))}
          </div>
        )}

        {activeTag && (
          <div className="flex items-center gap-2 px-3 sm:px-6 py-2 bg-violet-900/20 border-b border-violet-800/40 text-xs">
            <span className="text-violet-300">tag: {activeTag[0]}: {activeTag[1]}</span>
            <button onClick={() => setActiveTag(null)} className="text-violet-400 hover:text-violet-200">✕ clear</button>
          </div>
        )}
      </div>

      <div className="px-3 sm:px-6 py-1.5 text-xs text-gray-600">
        {filtered.length.toLocaleString()}{filtered.length !== files.length ? ` of ${files.length.toLocaleString()}` : ''} files
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-6 space-y-3">
        {loading && (
          <div className="py-12">
            <Loading messages={["scanning files…", "reading markdown…", "parsing frontmatter…"]} />
          </div>
        )}
        {error && <p className="text-sm text-red-400 py-4">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-600 py-8 text-center">No files found.</p>
        )}
        {!loading && filtered.map(f => (
          <MemoryCard
            key={f.id}
            memory={f}
            highlight={filter}
            onDelete={m => setDeleteTarget(m)}
            onEdit={f => setModal({ open: true, editing: f })}
            onMetadataUpdate={async (m, metadata) => {
              await api.update(m.source, m.id, m.content, metadata)
              setFiles(prev => prev.map(x => x.id === m.id ? { ...x, metadata } : x))
            }}
            activeTag={activeTag}
            onTagClick={tag => setActiveTag(prev =>
              prev && prev[0] === tag[0] && prev[1] === tag[1] ? null : tag
            )}
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
      {deleteTarget && (
        <DeleteConfirmModal
          label={deleteTarget.metadata?.filename as string ?? deleteTarget.id}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

export default LocalFiles
