import React, { useState } from 'react'
import { api } from '../api'

const MATCH_STYLES = {
  exact: { label: 'Exact match', color: 'text-verified border-verified/40 bg-verified/10' },
  partial: { label: 'Partial match', color: 'text-amber border-amber/40 bg-amber/10' },
  similar: { label: 'Similar name', color: 'text-muted border-border bg-surface2' },
}

const CATEGORY_ICONS = {
  image: '🖼',
  video: '🎬',
  document: '📄',
  folder: '📁',
  other: '📦',
}

const CATEGORY_FILTERS = [
  { value: 'any', label: 'All' },
  { value: 'image', label: 'Pictures' },
  { value: 'video', label: 'Videos' },
  { value: 'folder', label: 'Folders' },
  { value: 'document', label: 'Documents' },
]

function formatSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return '—'
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function FileSearchModal({ onClose }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('any')
  const [status, setStatus] = useState('idle') // idle | searching | done | error
  const [response, setResponse] = useState(null)
  const [error, setError] = useState('')

  async function runSearch(q, cat) {
    if (!q.trim()) return
    setStatus('searching')
    setError('')
    try {
      const data = await api.searchFile(q.trim(), cat)
      setResponse(data)
      setStatus('done')
    } catch (err) {
      setError(err.message || "Couldn't reach the File Search Agent on port 8008. Is it running?")
      setStatus('error')
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    runSearch(query, category)
  }

  function handleCategoryClick(cat) {
    setCategory(cat)
    if (query.trim() && status !== 'idle') {
      runSearch(query, cat)
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-surface border border-border rounded-lg w-full max-w-xl max-h-full overflow-y-auto p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-xs text-amber tracking-widest mb-2">FILE SEARCH</p>
            <h2 className="font-display text-2xl font-semibold">Find a file or folder</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="focus-ring text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. resume, vacation, sunset…"
            className="focus-ring flex-1 bg-surface2 border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-muted/60"
          />
          <button
            type="submit"
            disabled={status === 'searching' || !query.trim()}
            className="focus-ring px-5 py-2.5 rounded-md bg-amber text-bg font-medium hover:bg-amber/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {status === 'searching' ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div className="flex gap-2 mb-6 flex-wrap">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleCategoryClick(c.value)}
              className={`focus-ring text-xs px-3 py-1.5 rounded-full border transition-colors ${
                category === c.value
                  ? 'border-amber text-amber bg-amber/10'
                  : 'border-border text-muted hover:border-muted hover:text-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {status === 'error' && <p className="text-threat text-sm mb-4">{error}</p>}

        {status === 'done' && response && (
          <>
            <div className="flex items-center justify-between mb-4 text-xs text-muted">
              <span>
                {response.files_scanned} scanned · {response.duration_seconds}s
              </span>
              {response.expanded_keywords?.length > 0 && (
                <span>also tried: {response.expanded_keywords.join(', ')}</span>
              )}
            </div>

            {response.results.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">
                No {category === 'any' ? 'files or folders' : CATEGORY_FILTERS.find((c) => c.value === category)?.label.toLowerCase()} matching
                "{response.query}" found in Downloads, Desktop, Documents, Pictures, or Videos.
              </p>
            ) : (
              <div className="space-y-2">
                {response.results.map((r, i) => {
                  const style = MATCH_STYLES[r.match_type] || MATCH_STYLES.similar
                  return (
                    <div key={i} className="p-3 rounded-md border border-border bg-surface2">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className="font-mono text-sm text-ink break-all">
                          <span className="mr-1.5">{CATEGORY_ICONS[r.category] || '📦'}</span>
                          {r.filename}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${style.color}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-muted break-all mb-1.5">{r.path}</p>
                      <div className="flex gap-4 text-xs text-muted">
                        {r.category !== 'folder' && <span>{formatSize(r.size_bytes)}</span>}
                        <span>modified {formatDate(r.modified_time)}</span>
                        <span>similarity {(r.similarity * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {status === 'idle' && (
          <p className="text-muted text-sm py-6 text-center">
            Searches your real Downloads, Desktop, Documents, Pictures, and Videos folders — files
            and folders both, with typo tolerance and related-keyword matching. Filter by type above.
          </p>
        )}
      </div>
    </div>
  )
}
