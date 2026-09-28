// Maps a scan-reason string to a MITRE ATT&CK technique, where a real
// mapping exists. Not every heuristic maps cleanly to a single technique,
// so unmapped reasons are simply omitted rather than guessed.
const MITRE_MAP = [
  { match: /double-extension masquerade/i, id: 'T1036.008', name: 'Masquerading: Masquerade File Type', tactic: 'Defense Evasion' },
  { match: /impersonates a windows system process/i, id: 'T1036.005', name: 'Masquerading: Match Legitimate Name or Location', tactic: 'Defense Evasion' },
  { match: /high entropy/i, id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion' },
  { match: /spawned.*macro/i, id: 'T1204.002', name: 'User Execution: Malicious File', tactic: 'Execution' },
  { match: /sustained high cpu/i, id: 'T1496', name: 'Resource Hijacking', tactic: 'Impact' },
  { match: /network connections/i, id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control' },
  { match: /blocklist/i, id: 'T1588.001', name: 'Obtain Capabilities: Malware', tactic: 'Resource Development' },
]

function mapMitre(reasons) {
  const found = new Map()
  for (const r of reasons) {
    for (const m of MITRE_MAP) {
      if (m.match.test(r) && !found.has(m.id)) {
        found.set(m.id, { id: m.id, name: m.name, tactic: m.tactic })
      }
    }
  }
  return Array.from(found.values())
}

export function buildIncidentFromResults(results, user) {
  const files = results.files
  const processes = results.processes

  const flaggedFiles = files?.flagged_files || []
  const flaggedProcesses = processes?.flagged_processes || []
  const allFlagged = [...flaggedFiles, ...flaggedProcesses]

  const riskScore = allFlagged.length > 0 ? Math.max(...allFlagged.map((f) => f.risk_score)) : 0

  const allReasons = allFlagged.flatMap((f) => f.reasons || [])
  const mitreTechniques = mapMitre(allReasons)

  const agentFindings = []
  if (files) {
    const top = [...flaggedFiles].sort((a, b) => b.risk_score - a.risk_score)[0]
    agentFindings.push({
      agent: 'File Scanner Agent',
      finding: top
        ? `Scanned ${files.files_scanned} files; ${files.files_flagged} flagged, ${files.signature_cleared} cleared via digital signature. Highest risk: ${top.path} (${top.risk_score}/100) — ${top.reasons.join('; ')}.`
        : `Scanned ${files.files_scanned} files. No suspicious files detected.`,
      confidence: top ? Math.min(top.risk_score / 100, 0.99) : 0.5,
    })
  }
  if (processes) {
    const top = [...flaggedProcesses].sort((a, b) => b.risk_score - a.risk_score)[0]
    agentFindings.push({
      agent: 'Process Monitoring Agent',
      finding: top
        ? `Scanned ${processes.total_processes} live processes; ${processes.processes_flagged} flagged, ${processes.signature_cleared} cleared via digital signature. Highest risk: ${top.name} (PID ${top.pid}, ${top.risk_score}/100) — ${top.reasons.join('; ')}.`
        : `Scanned ${processes.total_processes} live processes. No suspicious activity detected.`,
      confidence: top ? Math.min(top.risk_score / 100, 0.99) : 0.5,
    })
  }

  const status = allFlagged.length > 0 ? 'Flagged Items Pending Manual Review' : 'Reviewed - No Threats Found'

  const recommendationHint =
    allFlagged.length === 0
      ? 'No action required. Continue routine scanning.'
      : `Review the ${allFlagged.length} flagged item(s) individually. None were auto-contained — this dashboard is read-only. Use the Response Agent directly for containment actions if any item is confirmed malicious.`

  return {
    incident_id: `SCAN-${Date.now()}`,
    detected_at: new Date().toISOString(),
    status,
    risk_score: riskScore,
    user: { name: user.email, email: user.email, account_id: 'dashboard-session' },
    mitre_techniques: mitreTechniques,
    agent_findings: agentFindings,
    actions_taken: [],
    recommendation_hint: recommendationHint,
  }
}
