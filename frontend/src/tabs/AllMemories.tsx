import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../api/client'
import type { MemoryEntry, AdapterInfo } from '../api/client'
import { MemoryCard } from '../components/MemoryCard'
import { MemoryModal } from '../components/MemoryModal'

type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest' | 'az' | 'za'

interface Props {
  adapters: AdapterInfo[]
  onStatsChange: () => void
}

export function AllMemories({ adapters, onStatsChange }: Props) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [liveFilter, setLiveFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [modal, setModal] = useState<{ open: boolean; editing?: MemoryEntry }>({ open: false })
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.listMemories(undefined, 2000)
      setMemories(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      const data = await api.search(query, undefined, 50)
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

  const filtered = useMemo(() => {
    let list = memories
    if (sourceFilter !== 'all') list = list.filter(m => m.source === sourceFilter)
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
  }, [memories, liveFilter, sort, sourceFilter])

  async function handleDelete(m: MemoryEntry) {
    if (!confirm('Delete this memory?')) return
    try {
      await api.delete(m.source, m.id)
      setMemories(prev => prev.filter(x => x.id !== m.id))
      onStatsChange()
    } catch (e) {
      alert(String(e))
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
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-800">
        <div className="flex-1 min-w-0 flex gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter… (Enter for semantic search, Esc to reset)"
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-3 py-2 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            {isSearching ? '…' : '⌕'}
          </button>
        </div>

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-300 focus:outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="longest">Longest</option>
          <option value="shortest">Shortest</option>
          <option value="az">A→Z</option>
          <option value="za">Z→A</option>
        </select>

        <button
          onClick={() => setModal({ open: true })}
          className="px-3 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white"
        >
          + New
        </button>
      </div>

      {/* source pills */}
      {sources.length > 2 && (
        <div className="flex gap-2 px-6 py-2 border-b border-gray-800 overflow-x-auto">
          {sources.map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap
                ${sourceFilter === s
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* count */}
      <div className="px-6 py-2 text-xs text-gray-600">
        {filtered.length.toLocaleString()} {filtered.length === memories.length ? '' : `of ${memories.length.toLocaleString()} `}memories
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        {loading && <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>}
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
    </div>
  )
}
