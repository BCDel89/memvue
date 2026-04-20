import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import type { MemoryEntry, AdapterInfo } from '../api/client'
import { api } from '../api/client'

const MarkdownEditor = lazy(() => import('./MarkdownEditor').then(m => ({ default: m.MarkdownEditor })))

interface Props {
  memory?: MemoryEntry | null
  adapters: AdapterInfo[]
  onSave: (content: string, adapterId: string, metadata?: Record<string, unknown>) => Promise<void>
  onClose: () => void
  llmConfigured?: boolean
}

export function MemoryModal({ memory, adapters, onSave, onClose, llmConfigured }: Props) {
  const [content, setContent] = useState(memory?.content ?? '')
  const [adapterId, setAdapterId] = useState(memory?.source ?? adapters[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [appliedTags, setAppliedTags] = useState<string[]>(() => {
    const existing = memory?.metadata?.tags
    return existing ? String(existing).split(',').map(t => t.trim()).filter(Boolean) : []
  })
  const [tagging, setTagging] = useState(false)
  const tagDebounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setContent(memory?.content ?? '')
    setAdapterId(memory?.source ?? adapters[0]?.id ?? '')
    const existing = memory?.metadata?.tags
    setAppliedTags(existing ? String(existing).split(',').map(t => t.trim()).filter(Boolean) : [])
    setSuggestedTags([])
  }, [memory, adapters])

  useEffect(() => {
    if (!llmConfigured || content.trim().length < 30) {
      setSuggestedTags([])
      return
    }
    clearTimeout(tagDebounce.current)
    tagDebounce.current = setTimeout(async () => {
      setTagging(true)
      try {
        const r = await api.suggestTags(content.trim())
        setSuggestedTags(r.tags.filter(t => !appliedTags.includes(t)))
      } catch { /* best effort */ }
      finally { setTagging(false) }
    }, 1200)
    return () => clearTimeout(tagDebounce.current)
  }, [content, llmConfigured])

  function applyTag(tag: string) {
    setAppliedTags(prev => prev.includes(tag) ? prev : [...prev, tag])
    setSuggestedTags(prev => prev.filter(t => t !== tag))
  }

  function removeTag(tag: string) {
    setAppliedTags(prev => prev.filter(t => t !== tag))
  }

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    setError('')
    try {
      const metadata: Record<string, unknown> | undefined =
        appliedTags.length > 0 ? { ...(memory?.metadata ?? {}), tags: appliedTags.join(', ') } : undefined
      await onSave(content.trim(), adapterId, metadata)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const showTagArea = llmConfigured && (appliedTags.length > 0 || suggestedTags.length > 0 || tagging)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl flex flex-col max-h-[90dvh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-100">{memory ? 'Edit memory' : 'New memory'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
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
            <label className="text-xs text-gray-500 mb-1 block">Content <span className="text-gray-600">(Cmd+S to save)</span></label>
            <Suspense fallback={<div className="h-52 rounded-lg border border-gray-700 bg-gray-800 animate-pulse" />}>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                onSave={handleSave}
                autoFocus
              />
            </Suspense>
          </div>

          {showTagArea && (
            <div className="space-y-2">
              {appliedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {appliedTags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-900/50 border border-violet-700 text-xs text-violet-300">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-violet-500 hover:text-violet-200">✕</button>
                    </span>
                  ))}
                </div>
              )}
              {(suggestedTags.length > 0 || tagging) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-600">
                    {tagging ? 'suggesting…' : 'suggested:'}
                  </span>
                  {suggestedTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => applyTag(tag)}
                      className="px-2 py-0.5 rounded-full border border-gray-600 text-xs text-gray-400 hover:border-violet-600 hover:text-violet-300 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-800 shrink-0">
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
