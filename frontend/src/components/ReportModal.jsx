import React, { useState } from 'react'
import { api } from '../api'
import { buildIncidentFromResults } from '../buildIncident'

export default function ReportModal({ results, user, onClose }) {
  const [status, setStatus] = useState('idle') // idle | generating | done | error
  const [error, setError] = useState('')
  const [incidentId, setIncidentId] = useState('')

  async function handleGenerate() {
    setStatus('generating')
    setError('')
    try {
      const incident = buildIncidentFromResults(results, user)
      setIncidentId(incident.incident_id)
      const blob = await api.generateReport(incident)

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${incident.incident_id}_report.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      setStatus('done')
    } catch (e) {
      setError(e.message || 'Could not reach the Report Agent (port 8004). Is it running?')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-bg/90 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-xs text-amber tracking-widest mb-2">INCIDENT REPORT</p>
            <h2 className="font-display text-xl font-semibold">Export as Word document</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="focus-ring text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <p className="text-sm text-muted leading-relaxed mb-6">
          This bundles every flagged item, its risk score, and a plain-English
          explanation into a formatted incident report — the same document
          your Response Agent's audit log can be appended to later.
        </p>

        {status === 'idle' && (
          <button
            onClick={handleGenerate}
            className="focus-ring w-full bg-amber text-bg font-medium py-2.5 rounded-md hover:bg-amber/90 transition-colors"
          >
            Generate report
          </button>
        )}

        {status === 'generating' && (
          <div className="flex items-center justify-center gap-3 py-3">
            <div className="w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted">Writing report…</span>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center py-2">
            <p className="text-verified font-medium mb-1">✓ Downloaded</p>
            <p className="text-xs text-muted font-mono">{incidentId}_report.docx</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-threat text-sm mb-4">{error}</p>
            <button
              onClick={handleGenerate}
              className="focus-ring w-full border border-border py-2.5 rounded-md hover:border-muted transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
