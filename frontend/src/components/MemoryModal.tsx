import { useState, useEffect } from 'react'
import type { MemoryEntry, AdapterInfo } from '../api/client'

interface Props {
  memory?: MemoryEntry | null
  adapters: AdapterInfo[]
  onSave: (content: string, adapterId: string, metadata?: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

export function MemoryModal({ memory, adapters, onSave, onClose }: Props) {
  const [content, setContent] = useState(memory?.content ?? '')
  const [adapterId, setAdapterId] = useState(memory?.source ?? adapters[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setContent(memory?.content ?? '')
    setAdapterId(memory?.source ?? adapters[0]?.id ?? '')
  }, [memory, adapters])

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave(content.trim(), adapterId)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">{memory ? 'Edit memory' : 'New memory'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {!memory && adapters.length > 1 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Adapter</label>
              <select
                value={adapterId}
                onChange={e => setAdapterId(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
              >
                {adapters.map(a => (
                  <option key={a.id} value={a.id}>{a.name}: {a.id}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={10}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-brand-500 resize-y"
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
