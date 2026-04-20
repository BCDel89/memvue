interface Props {
  count: number
  onConfirm: () => void
  onClose: () => void
}

export function SyncConfirmModal({ count, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-gray-100">Sync to mem0</h2>
          <p className="text-xs text-gray-500">{count} file{count !== 1 ? 's' : ''} will be processed</p>
        </div>

        <div className="space-y-3 text-sm text-gray-300">
          <p>
            mem0 is an AI memory layer that extracts and stores <span className="text-violet-300">facts and knowledge</span> from your files — not the raw content.
          </p>
          <ul className="space-y-2 text-gray-400">
            <li className="flex gap-2"><span className="text-violet-400 shrink-0">⬡</span> Each file is sent to your configured LLM, which pulls out meaningful memories</li>
            <li className="flex gap-2"><span className="text-violet-400 shrink-0">⬡</span> Memories are deduplicated and merged with anything already in mem0</li>
            <li className="flex gap-2"><span className="text-violet-400 shrink-0">⬡</span> Original files are not modified or deleted</li>
          </ul>
          <p className="text-xs text-gray-500 border-t border-gray-800 pt-3">
            This operation uses your LLM for each file — it may take a while and incur API costs depending on your provider.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onClose(); onConfirm() }}
            className="px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Sync {count} file{count !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
