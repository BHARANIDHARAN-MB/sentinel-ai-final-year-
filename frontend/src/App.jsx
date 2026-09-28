import React, { useState } from 'react'
import LandingPage from './components/LandingPage'
import LoginModal from './components/LoginModal'
import Dashboard from './components/Dashboard'
import ScanProgressModal from './components/ScanProgressModal'
import ResultsModal from './components/ResultsModal'
import VoiceChatBot from './components/VoiceChatBot'
import FileSearchModal from './components/FileSearchModal'

export default function App() {
  const [user, setUser] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [scanState, setScanState] = useState('idle') // idle | selecting | running | results
  const [selectedScan, setSelectedScan] = useState(null)
  const [scanResults, setScanResults] = useState(null)
  const [showFileSearch, setShowFileSearch] = useState(false)

  function handleLogin(userData) {
    setUser(userData)
    setShowLogin(false)
  }

  function handleLogout() {
    setUser(null)
    setScanState('idle')
    setScanResults(null)
  }

  function handleStartScan(selected) {
    setSelectedScan(selected)
    setScanState('running')
  }

  function handleScanComplete(results) {
    setScanResults(results)
    setScanState('results')
  }

  const lastScanSummary = scanResults
    ? {
        totalFlagged:
          (scanResults.files?.files_flagged || 0) + (scanResults.processes?.processes_flagged || 0),
        totalScanned:
          (scanResults.files?.files_scanned || 0) + (scanResults.processes?.total_processes || 0),
        // Capped list of what actually got flagged, so the assistant can answer
        // "what were they" instead of only ever knowing a count. Capped at 15 to
        // keep the request small - if there's more, the assistant is told to
        // summarize rather than enumerate everything.
        flaggedItems: [
          ...(scanResults.files?.flagged_files || []).map((f) => ({
            type: 'file',
            name: f.path.split(/[\\/]/).pop(),
            risk_score: f.risk_score,
            reason: f.reasons?.[0],
          })),
          ...(scanResults.processes?.flagged_processes || []).map((p) => ({
            type: 'process',
            name: p.name,
            risk_score: p.risk_score,
            reason: p.reasons?.[0],
          })),
        ].slice(0, 15),
      }
    : null

  if (!user) {
    return (
      <>
        <LandingPage onGetStarted={() => setShowLogin(true)} />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      </>
    )
  }

  return (
    <>
      <Dashboard
        user={user}
        onLogout={handleLogout}
        onStartScan={handleStartScan}
        onOpenFileSearch={() => setShowFileSearch(true)}
      />

      {showFileSearch && <FileSearchModal onClose={() => setShowFileSearch(false)} />}

      {scanState === 'running' && (
        <ScanProgressModal
          selected={selectedScan}
          onComplete={handleScanComplete}
          onCancel={() => setScanState('idle')}
        />
      )}

      {scanState === 'results' && scanResults && (
        <ResultsModal
          results={scanResults}
          user={user}
          onClose={() => setScanState('idle')}
          onBackToDashboard={() => {
            setScanState('idle')
            setScanResults(null)
          }}
        />
      )}

      <VoiceChatBot lastScanSummary={lastScanSummary} />
    </>
  )
}
