import React from 'react'
import { explainFinding } from '../explain'

export default function FileDetailPanel({ item, kind, onClose }) {
  const { risk, explanations, verdict, wasCleared } = explainFinding(item)
  const title = kind === 'file' ? item.path.split(/[\\/]/).pop() : item.name

  const riskColorClass = wasCleared
    ? 'text-verified border-verified/40 bg-verified/10'
    : {
        threat: 'text-threat border-threat/40 bg-threat/10',
        amber: 'text-amber border-amber/40 bg-amber/10',
        verified: 'text-verified border-verified/40 bg-verified/10',
      }[risk.color]

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-bg/70" onClick={onClose} />
      <div className="relative bg-surface border-l border-border w-full max-w-lg h-full overflow-y-auto p-8">
        <button onClick={onClose} aria-label="Close" className="focus-ring absolute top-6 right-6 text-muted hover:text-ink">
          ✕
        </button>

        <p className="font-mono text-xs text-amber tracking-widest mb-2">
          {kind === 'file' ? 'FILE DETAIL' : 'PROCESS DETAIL'}
        </p>
        <h2 className="font-display text-xl font-semibold mb-1 break-all pr-8">{title}</h2>
        {kind === 'file' && <p className="font-mono text-xs text-muted mb-4 break-all">{item.path}</p>}
        {kind === 'process' && (
          <p className="font-mono text-xs text-muted mb-4">
            PID {item.pid} · {item.exe || 'path unavailable'}
          </p>
        )}

        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium mb-6 ${riskColorClass}`}>
          {wasCleared ? '✓ Verified safe' : `${risk.label} risk`} · score {item.risk_score}/100
        </div>

        <div className="mb-6 p-4 rounded-md bg-surface2 border border-border">
          <p className="text-sm text-ink leading-relaxed">{verdict}</p>
        </div>

        <h3 className="text-sm font-medium text-muted mb-3">What triggered this</h3>
        <div className="space-y-4 mb-6">
          {explanations.map((e, i) => (
            <div key={i} className="border-l-2 border-border pl-4">
              <p className="font-mono text-xs text-muted mb-1.5">{e.raw}</p>
              <p className="text-sm text-ink leading-relaxed">{e.plain}</p>
            </div>
          ))}
        </div>

        {item.sha256 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted mb-2">SHA256</h3>
            <p className="font-mono text-xs text-ink break-all bg-surface2 border border-border rounded-md p-3">
              {item.sha256}
            </p>
          </div>
        )}

        {kind === 'process' && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-surface2 border border-border rounded-md p-3">
              <p className="text-xs text-muted mb-1">CPU</p>
              <p className="font-mono text-sm">{item.cpu_percent ?? '—'}%</p>
            </div>
            <div className="bg-surface2 border border-border rounded-md p-3">
              <p className="text-xs text-muted mb-1">Memory</p>
              <p className="font-mono text-sm">{item.memory_percent ?? '—'}%</p>
            </div>
          </div>
        )}

        {!wasCleared && (
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-muted leading-relaxed">
              This is an automated finding, not a confirmed threat. For a real
              response action (quarantine, kill process, block IP), use the
              Response Agent directly — this dashboard is read-only by design.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
