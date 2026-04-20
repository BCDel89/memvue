import { useState } from 'react'
import { api } from '../api/client'
import type { IngestCandidate, AdapterInfo } from '../api/client'

type Step = 'input' | 'extracting' | 'review' | 'saving' | 'done'

interface CandidateState {
  candidate: IngestCandidate
  content: string
  approved: boolean
}

interface Props {
  adapters: AdapterInfo[]
  userId: string
  onClose: () => void
  onSaved: () => void
}

export function IngestModal({ adapters, userId, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('input')
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [adapterId, setAdapterId] = useState(adapters[0]?.id ?? '')
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState<CandidateState[]>([])
  const [savedCount, setSavedCount] = useState(0)

  async function extract() {
    const content = inputMode === 'text' ? text.trim() : ''
    const urlVal = inputMode === 'url' ? url.trim() : ''
    if (!content && !urlVal) return
    setError('')
    setStep('extracting')
    try {
      const result = await api.ingest(content, urlVal, adapterId, userId)
      if (result.candidates.length === 0) {
        setError('No memories could be extracted from this content.')
        setStep('input')
        return
      }
      setCandidates(result.candidates.map(c => ({ candidate: c, content: c.content, approved: true })))
      setStep('review')
    } catch (e) {
      setError(String(e))
      setStep('input')
    }
  }

  async function save() {
    const toSave = candidates.filter(c => c.approved)
    if (toSave.length === 0) { onClose(); return }
    setStep('saving')
    let saved = 0
    for (const c of toSave) {
      try {
        await api.create(c.content, adapterId, c.candidate.metadata)
        saved++
      } catch { /* continue */ }
    }
    setSavedCount(saved)
    setStep('done')
    onSaved()
  }

  const approvedCount = candidates.filter(c => c.approved).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl sm:mx-4 rounded-t-2xl sm:rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl flex flex-col max-h-[90dvh]">

        {/* header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-100">Ingest content</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
        </div>

        {/* body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* INPUT STEP */}
          {(step === 'input' || step === 'extracting') && (
            <>
              {/* mode tabs */}
              <div className="flex gap-1 p-1 bg-gray-800 rounded-lg w-fit">
                {(['text', 'url'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setInputMode(m)}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${
                      inputMode === m ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {m === 'text' ? 'Paste text' : 'From URL'}
                  </button>
                ))}
              </div>

              {inputMode === 'text' ? (
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Paste anything — notes, articles, chat logs, docs…"
                  className="w-full h-48 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none font-mono"
                  autoFocus
                />
              ) : (
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                  autoFocus
                />
              )}

              {adapters.length > 1 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Save to adapter</label>
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

              {error && <p className="text-xs text-red-400">{error}</p>}

              {step === 'extracting' && (
                <p className="text-xs text-violet-400 animate-pulse">Extracting memories…</p>
              )}
            </>
          )}

          {/* REVIEW STEP */}
          {(step === 'review' || step === 'saving') && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {candidates.length} memories extracted — toggle to approve or skip each one.
              </p>
              {candidates.map((c, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    c.approved ? 'border-violet-700 bg-violet-900/10' : 'border-gray-700 bg-gray-800/50 opacity-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => setCandidates(prev => prev.map((x, j) => j === i ? { ...x, approved: !x.approved } : x))}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        c.approved ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-600'
                      }`}
                    >
                      {c.approved && <span className="text-[10px]">✓</span>}
                    </button>
                    <textarea
                      value={c.content}
                      onChange={e => setCandidates(prev => prev.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
                      className="flex-1 bg-transparent text-sm text-gray-200 resize-none focus:outline-none min-h-[3rem]"
                      rows={Math.max(2, Math.ceil(c.content.length / 80))}
                    />
                  </div>
                  {!!c.candidate.metadata?.tags && (
                    <p className="text-xs text-gray-500 pl-6">tags: {String(c.candidate.metadata.tags)}</p>
                  )}
                </div>
              ))}
              {step === 'saving' && (
                <p className="text-xs text-violet-400 animate-pulse">Saving…</p>
              )}
            </div>
          )}

          {/* DONE STEP */}
          {step === 'done' && (
            <div className="py-8 text-center space-y-2">
              <p className="text-2xl">✓</p>
              <p className="text-sm text-gray-300">{savedCount} {savedCount === 1 ? 'memory' : 'memories'} saved</p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 p-5 border-t border-gray-800 shrink-0">
          {step === 'input' && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">
                Cancel
              </button>
              <button
                onClick={extract}
                disabled={inputMode === 'text' ? !text.trim() : !url.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
              >
                Extract memories
              </button>
            </>
          )}
          {step === 'extracting' && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">
              Cancel
            </button>
          )}
          {(step === 'review' || step === 'saving') && (
            <>
              <button onClick={() => setStep('input')} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">
                ← Back
              </button>
              <button
                onClick={save}
                disabled={approvedCount === 0 || step === 'saving'}
                className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
              >
                Save {approvedCount > 0 ? `${approvedCount} ` : ''}selected
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-700 text-white">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
