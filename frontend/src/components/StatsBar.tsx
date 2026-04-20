interface Props {
  total: number
  sources: Record<string, number>
  onRefresh?: () => void
}

function shortSource(src: string): string {
  if (src.startsWith('fs:')) {
    const seg = src.replace('fs:', '').split('/').filter(Boolean).pop() ?? src
    return `fs:${seg}`
  }
  return src
}

export default function StatsBar({ total, sources, onRefresh }: Props) {
  const entries = Object.entries(sources)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 sm:px-6 py-2 border-b border-gray-800 bg-gray-950/50 text-xs text-gray-500">
      <span className="text-gray-300 font-semibold">{total.toLocaleString()} memories</span>
      {entries.map(([src, count]) => (
        <span key={src} title={src}>
          <span className="text-gray-400">{shortSource(src)}</span>
          <span className="ml-1 text-gray-600">{count}</span>
        </span>
      ))}
      <div className="ml-auto flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-gray-600 hover:text-gray-400 transition-colors"
            title="Refresh stats"
          >
            ↻
          </button>
        )}
        <a
          href="https://buymeacoffee.com/bcdel89"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-yellow-500 transition-colors"
          title="Support memvue"
        >
          ☕
        </a>
      </div>
    </div>
  )
}
