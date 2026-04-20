import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { LLMConfig } from '../api/client'

const USER_ID_KEY = 'memvue_user_id'
const API_KEY_KEY = 'memvue_api_key'

interface Props {
  onRefresh: () => void
}

export function Settings({ onRefresh }: Props) {
  const [userId, setUserId] = useState(() => localStorage.getItem(USER_ID_KEY) ?? 'default')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_KEY) ?? '')
  const [extensionsInput, setExtensionsInput] = useState('.md')
  const [fsRoots, setFsRoots] = useState<string[]>([])
  const [newRoot, setNewRoot] = useState('')
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({ provider: '', base_url: '', api_key: '', model: '' })
  const [llmStatus, setLlmStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [llmMessage, setLlmMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.health().then(h => {
      if (h.fs_extensions?.length) setExtensionsInput(h.fs_extensions.join(','))
      if (h.fs_roots) setFsRoots(h.fs_roots)
    }).catch(() => {})
    api.getLLMConfig().then(setLlmConfig).catch(() => {})
  }, [])

  async function handleAddRoot() {
    const path = newRoot.trim()
    if (!path) return
    try {
      const r = await api.addFsRoot(path)
      setFsRoots(r.fs_roots)
      setNewRoot('')
      onRefresh()
    } catch (e) {
      alert(`Failed to add directory: ${e}`)
    }
  }

  async function handleRemoveRoot(path: string) {
    try {
      const r = await api.removeFsRoot(path)
      setFsRoots(r.fs_roots)
      onRefresh()
    } catch (e) {
      alert(`Failed to remove directory: ${e}`)
    }
  }

  async function handleTestLLM() {
    setLlmStatus('testing')
    setLlmMessage('')
    try {
      await api.saveLLMConfig(llmConfig)
      const r = await api.testLLM()
      setLlmStatus(r.ok ? 'ok' : 'error')
      setLlmMessage(r.ok ? `${r.provider} · ${r.model}` : (r.error ?? 'Failed'))
    } catch (e) {
      setLlmStatus('error')
      setLlmMessage(String(e))
    }
  }

  async function save() {
    setSaving(true)
    localStorage.setItem(USER_ID_KEY, userId)
    localStorage.setItem(API_KEY_KEY, apiKey)
    const exts = extensionsInput.split(',').map(e => e.trim()).filter(Boolean)
    if (exts.length) {
      try { await api.updateExtensions(exts) } catch { /* non-fatal */ }
    }
    try { await api.saveLLMConfig(llmConfig) } catch { /* non-fatal */ }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onRefresh()
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-lg space-y-6">

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Identity</h2>

          <Field label="User ID" hint="Used to scope memories in mem0">
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              placeholder="default"
            />
          </Field>

          <Field label="API Key" hint={<>Sent as <code className="text-gray-500">x-api-key</code> header</>}>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              placeholder="Leave empty if MEMVUE_API_KEY is not set"
            />
          </Field>
        </section>

        <div className="border-t border-gray-800" />

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Filesystem</h2>

          <Field label="File Extensions" hint="Comma-separated extensions to scan (e.g. .md,.txt)">
            <input
              value={extensionsInput}
              onChange={e => setExtensionsInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              placeholder=".md"
            />
          </Field>

          <Field label="Memory Directories">
            <div className="space-y-1">
              {fsRoots.length === 0 && (
                <p className="text-xs text-gray-600 italic">No directories configured.</p>
              )}
              {fsRoots.map(root => (
                <div key={root} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
                  <code className="flex-1 min-w-0 truncate text-xs text-gray-300" title={root}>{root}</code>
                  <button onClick={() => handleRemoveRoot(root)} className="text-gray-500 hover:text-red-400 px-1 text-sm">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-2">
              <input
                value={newRoot}
                onChange={e => setNewRoot(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRoot() }}
                className="input flex-1 min-w-0"
                placeholder="/path/to/notes"
              />
              <button
                onClick={handleAddRoot}
                disabled={!newRoot.trim()}
                className="px-3 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </Field>
        </section>

        <div className="border-t border-gray-800" />

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">AI Features</h2>
            <p className="text-xs text-gray-600 mt-1">Enables ingest, smart tagging, and digest. Works with Ollama, OpenRouter, or any OpenAI-compatible API.</p>
          </div>

          <Field label="Provider">
            <select
              value={llmConfig.provider}
              onChange={e => setLlmConfig(c => ({ ...c, provider: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
            >
              <option value="">None (AI features disabled)</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai_compatible">OpenAI-compatible (OpenRouter, Groq…)</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </Field>

          {llmConfig.provider && llmConfig.provider !== 'anthropic' && (
            <Field label="Base URL">
              <input
                value={llmConfig.base_url}
                onChange={e => setLlmConfig(c => ({ ...c, base_url: e.target.value }))}
                placeholder={llmConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              />
            </Field>
          )}

          {(llmConfig.provider === 'openai_compatible' || llmConfig.provider === 'anthropic') && (
            <Field label="API Key">
              <input
                type="password"
                value={llmConfig.api_key}
                onChange={e => setLlmConfig(c => ({ ...c, api_key: e.target.value }))}
                placeholder="sk-…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              />
            </Field>
          )}

          {llmConfig.provider && (
            <Field label="Model">
              <input
                value={llmConfig.model}
                onChange={e => setLlmConfig(c => ({ ...c, model: e.target.value }))}
                placeholder={
                  llmConfig.provider === 'anthropic' ? 'claude-sonnet-4-6' :
                  llmConfig.provider === 'ollama' ? 'gemma3:4b' : 'gpt-4o'
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
              />
            </Field>
          )}

          {llmConfig.provider && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestLLM}
                disabled={llmStatus === 'testing' || !llmConfig.model}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded-lg transition-colors"
              >
                {llmStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              {llmStatus === 'ok' && <span className="text-xs text-emerald-400">✓ {llmMessage}</span>}
              {llmStatus === 'error' && <span className="text-xs text-red-400">✕ {llmMessage}</span>}
            </div>
          )}
        </section>

        <div className="border-t border-gray-800" />

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
        </div>

        <p className="text-xs text-gray-600">
          Backend: <code className="text-gray-500">http://localhost:7700</code>
        </p>

      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

export default Settings
