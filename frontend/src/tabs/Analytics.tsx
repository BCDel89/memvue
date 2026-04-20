import { useState, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import type { MemoryEntry } from '../api/client'
import { Loading } from '../components/Loading'

interface Props {
  userId: string
}

const STALE_DAYS = 90

function formatMonth(date: Date): string {
  return date.toLocaleString('en', { month: 'short', year: '2-digit' })
}

function isStaleMemory(m: MemoryEntry): boolean {
  if (m.metadata?.stale === 'true') return true
  const last = m.updated_at || m.created_at
  if (!last) return false
  const age = Date.now() - new Date(last).getTime()
  return age > STALE_DAYS * 24 * 60 * 60 * 1000
}

function shortSource(src: string): string {
  if (src.startsWith('fs:')) {
    const seg = src.replace('fs:', '').split('/').filter(Boolean).pop() ?? src
    return `fs:${seg}`
  }
  return src
}

export function Analytics({ userId }: Props) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.listMemories(undefined, 10000, userId)
      .then(setMemories)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  const analytics = useMemo(() => {
    if (!memories.length) return null

    const byAdapter: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byMonth: Record<string, number> = {}
    const byFile: Record<string, number> = {}
    let stale = 0

    for (const m of memories) {
      byAdapter[m.source] = (byAdapter[m.source] ?? 0) + 1

      const t = (m.metadata?.type as string) || 'uncategorized'
      byType[t] = (byType[t] ?? 0) + 1

      const created = m.created_at ? new Date(m.created_at) : null
      if (created && !isNaN(created.getTime())) {
        const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
        byMonth[key] = (byMonth[key] ?? 0) + 1
      }

      const file = m.metadata?.filename as string | undefined
      if (file) byFile[file] = (byFile[file] ?? 0) + 1

      if (isStaleMemory(m)) stale++
    }

    // last 12 months (contiguous)
    const now = new Date()
    const months: { label: string; key: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ label: formatMonth(d), key, count: byMonth[key] ?? 0 })
    }

    return {
      total: memories.length,
      stale,
      fresh: memories.length - stale,
      byAdapter: Object.entries(byAdapter).sort((a, b) => b[1] - a[1]),
      byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      months,
      topFiles: Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 10),
    }
  }, [memories])

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <Loading messages={['counting memories…', 'crunching numbers…']} />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-400 p-6">{error}</p>
  }

  if (!analytics) {
    return <p className="text-sm text-gray-600 p-6 text-center">No memories yet.</p>
  }

  const maxMonth = Math.max(1, ...analytics.months.map(m => m.count))
  const maxAdapter = Math.max(1, ...analytics.byAdapter.map(([, c]) => c))
  const maxType = Math.max(1, ...analytics.byType.map(([, c]) => c))
  const stalePct = Math.round((analytics.stale / analytics.total) * 100)

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
      {/* summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={analytics.total.toLocaleString()} />
        <SummaryCard label="Adapters" value={analytics.byAdapter.length.toString()} />
        <SummaryCard label="Stale" value={`${analytics.stale.toLocaleString()}`} sub={`${stalePct}%`} accent={stalePct > 30 ? 'amber' : 'gray'} />
        <SummaryCard label="Fresh" value={analytics.fresh.toLocaleString()} accent="violet" />
      </div>

      {/* monthly growth */}
      <Section title="Monthly growth" subtitle="memories created per month, last 12">
        <div className="flex items-end gap-1 h-36 px-1">
          {analytics.months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t bg-violet-600/70 group-hover:bg-violet-500 transition-colors"
                  style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count > 0 ? '2px' : '0' }}
                  title={`${m.label}: ${m.count}`}
                />
                {m.count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {m.count}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-600 truncate w-full text-center">{m.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* adapters + types side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="By adapter">
          <BarList items={analytics.byAdapter.map(([k, v]) => [shortSource(k), v])} max={maxAdapter} color="violet" />
        </Section>

        <Section title="By type">
          <BarList items={analytics.byType} max={maxType} color="emerald" />
        </Section>
      </div>

      {/* top files */}
      {analytics.topFiles.length > 0 && (
        <Section title="Top source files" subtitle="files with the most memories">
          <div className="space-y-1 text-sm">
            {analytics.topFiles.map(([name, count]) => (
              <div key={name} className="flex justify-between items-center py-1 px-2 rounded hover:bg-gray-800/50">
                <span className="text-gray-300 truncate pr-4 font-mono text-xs">{name}</span>
                <span className="text-gray-500 text-xs tabular-nums shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, accent = 'gray' }: { label: string; value: string; sub?: string; accent?: 'gray' | 'violet' | 'amber' }) {
  const accentClass =
    accent === 'violet' ? 'text-violet-400'
    : accent === 'amber' ? 'text-amber-400'
    : 'text-gray-200'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accentClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        {subtitle && <p className="text-xs text-gray-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function BarList({ items, max, color }: { items: [string, number][]; max: number; color: 'violet' | 'emerald' }) {
  const barColor = color === 'violet' ? 'bg-violet-600/70' : 'bg-emerald-600/70'
  return (
    <div className="space-y-2">
      {items.map(([label, count]) => (
        <div key={label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 truncate pr-2">{label}</span>
            <span className="text-gray-500 tabular-nums shrink-0">{count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default Analytics
