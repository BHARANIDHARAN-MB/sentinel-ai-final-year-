import React, { useEffect, useState } from 'react'
import { api } from '../api'

const SCAN_OPTIONS = [
  {
    id: 'files',
    title: 'File Scan',
    desc: 'Scans your real Downloads, Desktop, Temp, and Startup folders for suspicious files.',
    port: 8005,
  },
  {
    id: 'processes',
    title: 'Process Scan',
    desc: 'Reads your live running processes for masquerading names, spawn chains, and resource abuse.',
    port: 8006,
  },
]

export default function Dashboard({ user, onLogout, onStartScan, onOpenFileSearch }) {
  const [selected, setSelected] = useState({ files: true, processes: true })
  const [agentStatus, setAgentStatus] = useState(null)

  useEffect(() => {
    api.checkAllAgents().then(setAgentStatus)
  }, [])

  function toggle(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }

  const anySelected = selected.files || selected.processes
  const allAgentsUp = agentStatus?.every((a) => a.ok)

  return (
    <div className="min-h-screen bg-bg text-ink">
      <nav className="flex items-center justify-between px-8 py-6 border-b border-border">
        <div className="font-display font-semibold text-lg tracking-tight">
          SENTINEL<span className="text-amber">AI</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted font-mono">{user.email}</span>
          <button onClick={onLogout} className="focus-ring text-sm text-muted hover:text-ink transition-colors">
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-8 py-14">
        <p className="font-mono text-xs text-amber tracking-widest mb-2">NEW SCAN</p>
        <h1 className="font-display text-3xl font-semibold mb-2">What should Sentinel check?</h1>
        <p className="text-muted mb-10">Select one or both. Everything runs against your real machine.</p>

        {agentStatus && !allAgentsUp && (
          <div className="mb-8 px-4 py-3 rounded-md border border-threat/40 bg-threat/10 text-sm">
            <p className="text-threat font-medium mb-1">Some agents aren't reachable</p>
            <p className="text-muted">
              {agentStatus.filter((a) => !a.ok).map((a) => `port ${a.port}`).join(', ')} not responding.
              Make sure <code className="font-mono text-ink">start_all.ps1</code> is running.
            </p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-10">
          {SCAN_OPTIONS.map((opt) => {
            const isOn = selected[opt.id]
            const status = agentStatus?.find((a) => a.port === opt.port)
            return (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={`focus-ring text-left p-5 rounded-lg border transition-colors ${
                  isOn ? 'border-amber bg-amber/5' : 'border-border bg-surface hover:border-muted'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-medium text-lg">{opt.title}</h3>
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center ${
                      isOn ? 'bg-amber border-amber' : 'border-border'
                    }`}
                  >
                    {isOn && <span className="text-bg text-xs">✓</span>}
                  </div>
                </div>
                <p className="text-sm text-muted leading-relaxed mb-3">{opt.desc}</p>
                {status && (
                  <span className={`text-xs font-mono ${status.ok ? 'text-verified' : 'text-threat'}`}>
                    {status.ok ? '● agent online' : '○ agent offline'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button
          disabled={!anySelected}
          onClick={() => onStartScan(selected)}
          className="focus-ring px-6 py-3 rounded-md bg-amber text-bg font-medium hover:bg-amber/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start scan →
        </button>

        <div className="mt-14 pt-8 border-t border-border">
          <p className="font-mono text-xs text-amber tracking-widest mb-2">LOOKING FOR A FILE?</p>
          <h2 className="font-display text-xl font-semibold mb-2">Find a file by name</h2>
          <p className="text-muted text-sm mb-4 max-w-md">
            Fuzzy search across your real Downloads, Desktop, and Documents — typo-tolerant,
            with related-keyword matching.
          </p>
          <button
            onClick={onOpenFileSearch}
            className="focus-ring px-5 py-2.5 rounded-md border border-border text-ink hover:border-amber transition-colors"
          >
            Search files →
          </button>
        </div>
      </main>
    </div>
  )
}
