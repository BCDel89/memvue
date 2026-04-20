import { useState } from 'react'

interface Props {
  label: string
  onConfirm: () => void
  onClose: () => void
}

export function DeleteConfirmModal({ label, onConfirm, onClose }: Props) {
  const [input, setInput] = useState('')
  const ready = input === 'delete'

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-sm font-semibold text-red-400 mb-1">Delete</h2>
        <p className="text-xs text-gray-400 mb-4 break-all">{label}</p>
        <p className="text-xs text-gray-500 mb-2">
          Type <span className="font-mono text-red-400">delete</span> to confirm
        </p>
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) onConfirm() }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500 mb-4"
          placeholder="delete"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteConfirmModal
