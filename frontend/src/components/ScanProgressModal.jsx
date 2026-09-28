import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const POLL_INTERVAL_MS = 250

function shortenPath(path, max = 55) {
  if (!path) return ''
  if (path.length <= max) return path
  const parts = path.split(/[\\/]/)
  const fname = parts.pop()
  return `…${path.slice(-1 * (max - fname.length - 1))}`
}

function FileProgressBar({ job }) {
  const total = job.files_total
  const scanned = job.files_scanned
  const pct = total ? Math.min(100, Math.round((scanned / total) * 100)) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-ink">
          {job.status === 'counting' && 'Counting files…'}
          {job.status === 'scanning' && total && `Scanning file ${scanned} of ${total}`}
          {job.status === 'scanning' && !total && `Scanning… (${scanned} so far)`}
        </p>
        {total && <p className="text-xs text-muted font-mono">{pct}%</p>}
      </div>

      {total && (
        <div className="h-1.5 bg-surface2 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-amber transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {job.current_file && (
        <p className="font-mono text-xs text-muted truncate" title={job.current_file}>
          {shortenPath(job.current_file)}
        </p>
      )}

      {job.flagged_so_far > 0 && (
        <p className="text-xs text-threat mt-2">{job.flagged_so_far} flagged so far</p>
      )}
    </div>
  )
}

export default function ScanProgressModal({ selected, onComplete, onCancel }) {
  const [fileJob, setFileJob] = useState(null) // live job state from polling
  const [processStatus, setProcessStatus] = useState('pending') // pending | running | done | error
  const started = useRef(false)
  const pollRef = useRef(null)
  const resultsRef = useRef({})

  useEffect(() => {
    if (started.current) return
    started.current = true
    runScans()
    return () => clearInterval(pollRef.current)
  }, [])

  async function runScans() {
    if (selected.files) {
      await runFileScan()
    }
    if (selected.processes) {
      await runProcessScan()
    }
    setTimeout(() => onComplete(resultsRef.current), 400)
  }

  async function runFileScan() {
    try {
      const { job_id } = await api.startFileScan()

      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const job = await api.getFileScanProgress(job_id)
            setFileJob(job)
            if (job.status === 'done') {
              clearInterval(pollRef.current)
              resultsRef.current.files = job.result
              resolve()
            } else if (job.status === 'error') {
              clearInterval(pollRef.current)
              reject(new Error(job.error))
            }
          } catch (e) {
            clearInterval(pollRef.current)
            reject(e)
          }
        }, POLL_INTERVAL_MS)
      })
    } catch (e) {
      setFileJob({ status: 'error', error: e.message })
    }
  }

  async function runProcessScan() {
    setProcessStatus('running')
    try {
      resultsRef.current.processes = await api.scanProcesses()
      setProcessStatus('done')
    } catch (e) {
      setProcessStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-8">
        <p className="font-mono text-xs text-amber tracking-widest mb-2">SCAN IN PROGRESS</p>
        <h2 className="font-display text-2xl font-semibold mb-8">Reading your system</h2>

        <div className="space-y-6">
          {selected.files && (
            <div className="flex gap-4">
              <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                {(!fileJob || fileJob.status === 'counting' || fileJob.status === 'scanning') && (
                  <div className="w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />
                )}
                {fileJob?.status === 'done' && <span className="text-verified">✓</span>}
                {fileJob?.status === 'error' && <span className="text-threat">✕</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink mb-1">File Scanner</p>
                {fileJob ? (
                  fileJob.status === 'error' ? (
                    <p className="text-xs text-threat">{fileJob.error}</p>
                  ) : fileJob.status === 'done' ? (
                    <p className="text-xs text-muted">
                      {fileJob.result?.files_scanned} files scanned, {fileJob.result?.files_flagged} flagged
                    </p>
                  ) : (
                    <FileProgressBar job={fileJob} />
                  )
                ) : (
                  <p className="text-xs text-muted">Starting…</p>
                )}
              </div>
            </div>
          )}

          {selected.processes && (
            <div className="flex items-center gap-4">
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                {processStatus === 'pending' && <div className="w-2 h-2 rounded-full bg-border" />}
                {processStatus === 'running' && (
                  <div className="w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />
                )}
                {processStatus === 'done' && <span className="text-verified">✓</span>}
                {processStatus === 'error' && <span className="text-threat">✕</span>}
              </div>
              <div>
                <p className={`text-sm ${processStatus === 'pending' ? 'text-muted' : 'text-ink'}`}>
                  Process Monitor
                </p>
                {processStatus === 'running' && (
                  <p className="text-xs text-muted font-mono mt-0.5">reading live system data…</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            clearInterval(pollRef.current)
            onCancel()
          }}
          className="focus-ring mt-8 text-sm text-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
