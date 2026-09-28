import React, { useState } from 'react'
import FileDetailPanel from './FileDetailPanel'
import ReportModal from './ReportModal'

function riskDot(score) {
  if (score >= 60) return 'bg-threat'
  if (score >= 35) return 'bg-amber'
  return 'bg-verified'
}

function ItemRow({ item, kind, onClick }) {
  const label = kind === 'file' ? item.path : `${item.name} (PID ${item.pid})`
  return (
    <button
      onClick={() => onClick(item, kind)}
      className="focus-ring w-full text-left px-4 py-3 rounded-md border border-border hover:border-amber/60 bg-surface2 transition-colors flex items-center gap-3"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${riskDot(item.risk_score)}`} />
      <span className="font-mono text-xs text-ink truncate flex-1">{label}</span>
      <span className="text-xs text-muted shrink-0">risk {item.risk_score}</span>
    </button>
  )
}

export default function ResultsModal({ results, user, onClose, onBackToDashboard }) {
  const [detailItem, setDetailItem] = useState(null)
  const [showReport, setShowReport] = useState(false)

  const files = results.files
  const processes = results.processes

  const totalFlagged = (files?.files_flagged || 0) + (processes?.processes_flagged || 0)
  const totalCleared = (files?.signature_cleared || 0) + (processes?.signature_cleared || 0)
  const totalScanned = (files?.files_scanned || 0) + (processes?.total_processes || 0)

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-surface border border-border rounded-lg w-full max-w-2xl max-h-full overflow-y-auto p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-xs text-amber tracking-widest mb-2">SCAN COMPLETE</p>
            <h2 className="font-display text-2xl font-semibold">Results</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="focus-ring text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-surface2 border border-border rounded-md p-4 text-center">
            <p className="font-display text-2xl font-semibold">{totalScanned}</p>
            <p className="text-xs text-muted mt-1">scanned</p>
          </div>
          <div className="bg-surface2 border border-threat/40 rounded-md p-4 text-center">
            <p className="font-display text-2xl font-semibold text-threat">{totalFlagged}</p>
            <p className="text-xs text-muted mt-1">flagged</p>
          </div>
          <div className="bg-surface2 border border-verified/40 rounded-md p-4 text-center">
            <p className="font-display text-2xl font-semibold text-verified">{totalCleared}</p>
            <p className="text-xs text-muted mt-1">signature-cleared</p>
          </div>
        </div>

        {files?.flagged_files?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted mb-3">Flagged files ({files.flagged_files.length})</h3>
            <div className="space-y-2">
              {files.flagged_files.map((f, i) => (
                <ItemRow key={i} item={f} kind="file" onClick={(item, kind) => setDetailItem({ item, kind })} />
              ))}
            </div>
          </div>
        )}

        {processes?.flagged_processes?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted mb-3">
              Flagged processes ({processes.flagged_processes.length})
            </h3>
            <div className="space-y-2">
              {processes.flagged_processes.map((p, i) => (
                <ItemRow key={i} item={p} kind="process" onClick={(item, kind) => setDetailItem({ item, kind })} />
              ))}
            </div>
          </div>
        )}

        {totalFlagged === 0 && (
          <div className="text-center py-10 mb-6">
            <p className="text-verified text-lg mb-1">Nothing suspicious found</p>
            <p className="text-muted text-sm">Your system came back clean on this scan.</p>
          </div>
        )}

        {totalCleared > 0 && (
          <details className="mb-8">
            <summary className="text-sm text-muted cursor-pointer hover:text-ink">
              Show {totalCleared} signature-verified items (cleared, not threats)
            </summary>
            <div className="space-y-2 mt-3">
              {files?.signature_cleared_files?.map((f, i) => (
                <ItemRow key={`f${i}`} item={f} kind="file" onClick={(item, kind) => setDetailItem({ item, kind })} />
              ))}
              {processes?.signature_cleared_processes?.map((p, i) => (
                <ItemRow key={`p${i}`} item={p} kind="process" onClick={(item, kind) => setDetailItem({ item, kind })} />
              ))}
            </div>
          </details>
        )}

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            onClick={() => setShowReport(true)}
            className="focus-ring flex-1 bg-amber text-bg font-medium py-2.5 rounded-md hover:bg-amber/90 transition-colors"
          >
            Generate incident report
          </button>
          <button
            onClick={onBackToDashboard}
            className="focus-ring px-5 py-2.5 rounded-md border border-border text-ink hover:border-muted transition-colors"
          >
            New scan
          </button>
        </div>
      </div>

      {detailItem && (
        <FileDetailPanel item={detailItem.item} kind={detailItem.kind} onClose={() => setDetailItem(null)} />
      )}

      {showReport && (
        <ReportModal results={results} user={user} onClose={() => setShowReport(false)} />
      )}
    </div>
  )
}
