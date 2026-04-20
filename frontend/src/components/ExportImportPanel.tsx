import { useState, useRef } from 'react'
import { api } from '../api/client'
import type { AdapterInfo } from '../api/client'

interface Props {
  adapters: AdapterInfo[]
  userId: string
  onImported: () => void
}

export function ExportImportPanel({ adapters, userId, onImported }: Props) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null)
  const [importError, setImportError] = useState('')
  const [importAdapter, setImportAdapter] = useState(adapters.find(a => a.id === 'mem0')?.id ?? adapters[0]?.id ?? '')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExport(format: 'json' | 'markdown-zip') {
    setExporting(true)
    setExportError('')
    try {
      await api.exportMemories(format, userId)
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExporting(false)
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const text = await file.text()
      let memories: object[]
      if (file.name.endsWith('.json') || file.type === 'application/json') {
        const parsed = JSON.parse(text)
        memories = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        // NDJSON
        memories = text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
      }
      const result = await api.importMemories(memories, importAdapter, userId, skipDuplicates)
      setImportResult(result)
      if (result.imported > 0) onImported()
    } catch (e) {
      setImportError(String(e))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">Export / Import</h3>

      {/* Export */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Export all memories for backup or migration</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 transition-colors"
          >
            ↓ JSON
          </button>
          <button
            onClick={() => handleExport('markdown-zip')}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 transition-colors"
          >
            ↓ Markdown ZIP
          </button>
          {exporting && <span className="text-xs text-gray-500 self-center">preparing…</span>}
        </div>
        {exportError && <p className="text-xs text-red-400">{exportError}</p>}
      </div>

      <div className="border-t border-gray-800" />

      {/* Import */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Import from JSON or NDJSON file</p>

        {adapters.length > 1 && (
          <select
            value={importAdapter}
            onChange={e => setImportAdapter(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-200 focus:outline-none"
          >
            {adapters.filter(a => !a.id.startsWith('fs:')).map(a => (
              <option key={a.id} value={a.id}>{a.name}: {a.id}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={e => setSkipDuplicates(e.target.checked)}
            className="accent-violet-500"
          />
          Skip exact duplicates
        </label>

        <div className="flex items-center gap-2">
          <label className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${importing ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
            {importing ? 'importing…' : '↑ Choose file'}
            <input
              ref={fileRef}
              type="file"
              accept=".json,.ndjson"
              className="hidden"
              disabled={importing}
              onChange={handleFileImport}
            />
          </label>
          {importResult && (
            <span className="text-xs text-gray-400">
              {importResult.imported} imported
              {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ''}
              {importResult.errors > 0 ? `, ${importResult.errors} errors` : ''}
            </span>
          )}
        </div>
        {importError && <p className="text-xs text-red-400">{importError}</p>}
      </div>
    </div>
  )
}
