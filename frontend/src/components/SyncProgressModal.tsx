import { Loading } from './Loading'

interface SyncState {
  running: boolean
  total: number
  done: number
  errors: number
  cancelled: boolean
}

interface Props {
  state: SyncState
  onCancel: () => void
  onClose: () => void
}

export function SyncProgressModal({ state, onCancel, onClose }: Props) {
  const { running, total, done, errors, cancelled } = state
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const statusText = cancelled
    ? `Cancelled after ${done} of ${total}`
    : running
    ? `Syncing ${done} of ${total}…`
    : `Done — ${done - errors} synced${errors > 0 ? `, ${errors} failed` : ''}`

  const syncMessages = [
    'sending to mem0…',
    'extracting memories…',
    'deduplicating…',
    'updating knowledge graph…',
    'almost there…',
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-100">Sync to mem0</h2>

        {running ? (
          <Loading messages={syncMessages} className="py-2" />
        ) : (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">{statusText}</p>

        <div className="flex justify-end gap-2">
          {running ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
