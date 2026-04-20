import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { DuplicateEntry } from '../api/client'
import { Loading } from '../components/Loading'

interface Props {
  userId: string
  onStatsChange: () => void
}

function sourceColor(source: string) {
  if (source === 'mem0') return 'bg-violet-900/60 text-violet-300 border-violet-700'
  if (source.startsWith('fs:')) return 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
  return 'bg-gray-800 text-gray-400 border-gray-700'
}

function shortSource(src: string): string {
  if (src.startsWith('fs:')) {
    return 'fs:' + (src.replace('fs:', '').split('/').filter(Boolean).pop() ?? src)
  }
  return src
}

function ClusterCard({
  cluster,
  index,
  total,
  onResolved,
}: {
  cluster: DuplicateEntry[]
  index: number
  total: number
  onResolved: () => void
}) {
  const [merging, setMerging] = useState(false)
  const [editingFor, setEditingFor] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [error, setError] = useState('')

  async function keepOne(keep: DuplicateEntry) {
    setMerging(true)
    setError('')
    try {
      const content = editingFor === keep.id ? editContent.trim() || keep.content : undefined
      const discards = cluster.filter(m => m.id !== keep.id)
      for (const d of discards) {
        await api.merge(keep.id, keep.adapter_id, d.id, d.adapter_id, content)
      }
      onResolved()
    } catch (e) {
      setError(String(e))
      setMerging(false)
    }
  }

  function toggleEdit(m: DuplicateEntry) {
    if (editingFor === m.id) {
      setEditingFor(null)
    } else {
      setEditingFor(m.id)
      setEditContent(m.content)
    }
  }

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Group {index + 1} of {total} · {cluster.length} similar memories
        </span>
      </div>

      <div className={`grid gap-px bg-gray-800 ${cluster.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {cluster.map(m => (
          <div key={m.id} className="bg-gray-950 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${sourceColor(m.source)}`}>
                {shortSource(m.source)}
              </span>
              {m.created_at && (
                <span className="text-xs text-gray-600">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {editingFor === m.id ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="flex-1 min-h-[120px] bg-gray-800 border border-violet-700 rounded-lg px-3 py-2 text-sm text-gray-100 resize-y focus:outline-none focus:border-violet-500"
              />
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed flex-1 line-clamp-6 whitespace-pre-wrap">
                {m.content}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => keepOne(m)}
                disabled={merging}
                className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                {editingFor === m.id ? 'Keep (edited)' : 'Keep this'}
              </button>
              <button
                onClick={() => toggleEdit(m)}
                disabled={merging}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg transition-colors"
              >
                {editingFor === m.id ? 'Cancel edit' : 'Edit before keeping'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-900 border-t border-gray-800 flex items-center justify-between gap-3">
        {error && <span className="text-xs text-red-400 flex-1">{error}</span>}
        {!error && <span className="flex-1" />}
        <button
          onClick={onResolved}
          disabled={merging}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

export function Consolidate({ userId, onStatsChange }: Props) {
  const [clusters, setClusters] = useState<DuplicateEntry[][]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [error, setError] = useState('')
  const [threshold, setThreshold] = useState(0.5)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setDismissed(new Set())
    try {
      const r = await api.duplicates(threshold, userId)
      setClusters(r.clusters)
      setScanned(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [threshold, userId])

  useEffect(() => {
    load()
  }, [load])

  function dismiss(index: number) {
    setDismissed(prev => new Set([...prev, index]))
  }

  function resolveAndRefresh(index: number) {
    dismiss(index)
    onStatsChange()
  }

  const visible = clusters.filter((_, i) => !dismissed.has(i))

  return (
    <div className="h-full overflow-y-auto px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h1 className="text-base font-semibold text-white">Consolidate</h1>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <label className="text-xs text-gray-500">
            Similarity threshold:
            <span className="text-gray-300 ml-1">{Math.round(threshold * 100)}%</span>
          </label>
          <input
            type="range"
            min={0.3}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-28 accent-violet-500"
          />
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded-lg transition-colors"
          >
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      </div>

      {loading && <Loading />}

      {!loading && error && (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {!loading && scanned && !error && visible.length === 0 && (
        <div className="text-center py-20 text-gray-600">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm">No duplicates found at {Math.round(threshold * 100)}% similarity.</p>
          <p className="text-xs mt-1">Lower the threshold to find more candidates.</p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {visible.length} group{visible.length !== 1 ? 's' : ''} — keep one version, or skip to leave both.
          </p>
          {clusters.map((cluster, i) =>
            dismissed.has(i) ? null : (
              <ClusterCard
                key={i}
                cluster={cluster}
                index={clusters.filter((_, j) => !dismissed.has(j)).indexOf(cluster)}
                total={visible.length}
                onResolved={() => resolveAndRefresh(i)}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
