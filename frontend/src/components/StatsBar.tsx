interface Props {
  total: number
  sources: Record<string, number>
  onRefresh?: () => void
}

export default function StatsBar({ total, sources, onRefresh }: Props) {
  const entries = Object.entries(sources)

  return (
    <div className="flex flex-wrap items-center gap-4 px-6 py-2 border-b border-gray-800 bg-gray-950/50 text-xs text-gray-500">
      <span className="text-gray-300 font-semibold">{total.toLocaleString()} memories</span>
      {entries.map(([src, count]) => (
        <span key={src}>
          <span className="text-gray-400">{src}</span>
          <span className="ml-1 text-gray-600">{count}</span>
        </span>
      ))}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-auto text-gray-600 hover:text-gray-400 transition-colors"
          title="Refresh stats"
        >
          ↻
        </button>
      )}
    </div>
  )
}
