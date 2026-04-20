import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../api/client'
import type { MemoryEntry, AdapterInfo } from '../api/client'
import { MemoryCard, memoryTags, isStale } from '../components/MemoryCard'
import { MemoryModal } from '../components/MemoryModal'
import { Loading } from '../components/Loading'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'
import { IngestModal } from '../components/IngestModal'

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
  llmConfigured?: boolean
}

export function AllMemories({ adapters, userId, onStatsChange, llmConfigured }: Props) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [liveFilter, setLiveFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [modal, setModal] = useState<{ open: boolean; editing?: MemoryEntry }>({ open: false })
  const [activeTag, setActiveTag] = useState<[string, string] | null>(null)
  const [category, setCategory] = useState<string>('all')
  const [staleOnly, setStaleOnly] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.listMemories(undefined, 2000, userId)
      setMemories(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  function handleQueryChange(val: string) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setLiveFilter(val), 200)
  }

  async function handleSearch() {
    if (!query.trim()) {
      load()
      return
    }
    setIsSearching(true)
    setError('')
    try {
      const data = await api.search(query, undefined, 50, userId)
      setMemories(data)
      setLiveFilter('')
    } catch (e) {
      setError(String(e))
    } finally {
      setIsSearching(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') { setQuery(''); setLiveFilter(''); load() }
  }

  const sources = useMemo(() => ['all', ...Array.from(new Set(memories.map(m => m.source)))], [memories])

  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    let uncategorized = 0
    for (const m of memories) {
      const t = m.metadata?.type as string | undefined
      if (t) counts[t] = (counts[t] ?? 0) + 1
      else uncategorized++
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return [
      ['all', memories.length] as [string, number],
      ...sorted,
      ...(uncategorized > 0 ? [['uncategorized', uncategorized] as [string, number]] : []),
    ]
  }, [memories])

  const filtered = useMemo(() => {
    let list = memories
    if (sourceFilter !== 'all') list = list.filter(m => m.source === sourceFilter)
    if (category !== 'all') {
      if (category === 'uncategorized') list = list.filter(m => !m.metadata?.type)
      else list = list.filter(m => m.metadata?.type === category)
    }
    if (activeTag) list = list.filter(m =>
      memoryTags(m).some(([k, v]) => k === activeTag[0] && v === activeTag[1])
    )
    if (staleOnly) list = list.filter(m => isStale(m))
    if (liveFilter) list = list.filter(m =>
      m.content.toLowerCase().includes(liveFilter.toLowerCase()) ||
      m.id.toLowerCase().includes(liveFilter.toLowerCase())
    )
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'newest': return (b.created_at ?? '').localeCompare(a.created_at ?? '')
        case 'oldest': return (a.created_at ?? '').localeCompare(b.created_at ?? '')
        case 'longest': return b.content.length - a.content.length
        case 'shortest': return a.content.length - b.content.length
        case 'az': return a.content.localeCompare(b.content)
        case 'za': return b.content.localeCompare(a.content)
      }
    })
  }, [memories, liveFilter, sort, sourceFilter, activeTag, category])

  const staleCount = useMemo(() => memories.filter(m => isStale(m)).length, [memories])
  const activeFilterCount = (category !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (activeTag ? 1 : 0) + (staleOnly ? 1 : 0)

  async function handleDelete(m: MemoryEntry) {
    setDeleteTarget(m)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await api.delete(deleteTarget.source, deleteTarget.id)
      setMemories(prev => prev.filter(x => x.id !== deleteTarget.id))
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
      setMemories(prev => prev.map(x => x.id === updated.id ? updated : x))
    } else {
      const created = await api.create(content, adapterId)
      setMemories(prev => [created, ...prev])
      onStatsChange()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 border-b border-gray-800">
        {/* search input with embedded button */}
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search memories…"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 pl-3 pr-8 py-1.5 sm:py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 disabled:opacity-40 text-base leading-none"
            title="Semantic search (↵)"
          >
            {isSearching ? '…' : '⌕'}
          </button>
        </div>

        {/* sort */}
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

        {llmConfigured && (
          <button
            onClick={() => setIngestOpen(true)}
            className="px-3 py-1.5 sm:py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 whitespace-nowrap"
            title="Extract memories from pasted text or URL"
          >
            ↓ Ingest
          </button>
        )}
        {/* new */}
        <button
          onClick={() => setModal({ open: true })}
          className="px-3 py-1.5 sm:py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white whitespace-nowrap"
        >
          + New
        </button>
      </div>

      {/* filter panel — hidden on mobile unless toggled, always shown on sm+ */}
      <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-col`}>
        {/* category pills */}
        {categories.length > 1 && (
          <div className="flex gap-2 px-3 sm:px-6 py-2 border-b border-gray-800 overflow-x-auto">
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap
                  ${category === cat
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
              >
                {cat} <span className="opacity-70">({count})</span>
              </button>
            ))}
          </div>
        )}

        {/* source pills */}
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

        {staleCount > 0 && (
          <div className="flex gap-2 px-3 sm:px-6 py-2 border-b border-gray-800 overflow-x-auto">
            <button
              onClick={() => setStaleOnly(s => !s)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap
                ${staleOnly
                  ? 'bg-amber-700 border-amber-600 text-white'
                  : 'bg-gray-800 border-amber-800/50 text-amber-400 hover:border-amber-700'}`}
            >
              stale <span className="opacity-70">({staleCount})</span>
            </button>
          </div>
        )}

        {activeTag && (
          <div className="flex items-center gap-2 px-3 sm:px-6 py-2 bg-violet-900/20 border-b border-violet-800/40 text-xs">
            <span className="text-violet-300">tag: {activeTag[0]}: {activeTag[1]}</span>
            <button onClick={() => setActiveTag(null)} className="text-violet-400 hover:text-violet-200">✕ clear</button>
          </div>
        )}
      </div>

      {/* count */}
      <div className="px-3 sm:px-6 py-1.5 text-xs text-gray-600">
        {filtered.length.toLocaleString()} {filtered.length === memories.length ? '' : `of ${memories.length.toLocaleString()} `}memories
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-6 space-y-3">
        {loading && (
          <div className="py-12">
            <Loading messages={["loading memories…", "fetching from adapters…", "scanning local files…"]} />
          </div>
        )}
        {error && <p className="text-sm text-red-400 py-4">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-600 py-8 text-center">No memories found.</p>
        )}
        {filtered.map(m => (
          <MemoryCard
            key={m.id}
            memory={m}
            highlight={liveFilter}
            onDelete={handleDelete}
            onEdit={m => setModal({ open: true, editing: m })}
            onMetadataUpdate={async (m, metadata) => {
              await api.update(m.source, m.id, m.content, metadata)
              setMemories(prev => prev.map(x => x.id === m.id ? { ...x, metadata } : x))
            }}
            activeTag={activeTag}
            onTagClick={(tag) => setActiveTag(prev => prev && prev[0] === tag[0] && prev[1] === tag[1] ? null : tag)}
          />
        ))}
      </div>

      {modal.open && (
        <MemoryModal
          memory={modal.editing}
          adapters={adapters}
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
      {ingestOpen && (
        <IngestModal
          adapters={adapters}
          userId={userId}
          onClose={() => setIngestOpen(false)}
          onSaved={() => { load(); onStatsChange() }}
        />
      )}
    </div>
  )
}

export default AllMemories
