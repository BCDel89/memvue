import { useEffect, useRef } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

interface Props {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  placeholder?: string
  autoFocus?: boolean
}

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '0.875rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    background: 'transparent',
  },
  '.cm-scroller': { overflow: 'auto', minHeight: '200px', maxHeight: '60dvh' },
  '.cm-content': { padding: '12px', caretColor: '#a78bfa' },
  '.cm-line': { padding: '0 4px' },
  '.cm-cursor': { borderLeftColor: '#a78bfa' },
  '.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(167, 139, 250, 0.05)' },
  '.cm-gutters': { display: 'none' },
})

export function MarkdownEditor({ value, onChange, onSave, placeholder = 'Write something…', autoFocus = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSave?.()
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        saveKeymap,
        markdown({ base: markdownLanguage }),
        oneDark,
        baseTheme,
        cmPlaceholder(placeholder),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    if (autoFocus) {
      setTimeout(() => view.focus(), 50)
    }

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. modal reset) without re-creating the editor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-gray-700 focus-within:border-violet-500 transition-colors overflow-hidden"
    />
  )
}
