// Turns the raw technical reason strings from the agents into a plain-English
// explanation, without needing an LLM call - the reasons are already
// structured enough that pattern-matching gives a reliable, fast summary.

function riskLabel(score) {
  if (score >= 85) return { label: 'Critical', color: 'threat' }
  if (score >= 60) return { label: 'High', color: 'threat' }
  if (score >= 35) return { label: 'Medium', color: 'amber' }
  return { label: 'Low', color: 'verified' }
}

function explainReason(reason) {
  const r = reason.toLowerCase()

  if (r.includes('cleared') && r.includes('signed')) {
    return "This file's publisher was cryptographically verified through its digital signature. That's a much stronger guarantee than a filename or file path — it can't be faked without a stolen certificate."
  }
  if (r.includes('sha256 hash matches')) {
    return "This file's exact fingerprint matches a known-malicious file in the threat database. This is the highest-confidence signal available — it means this exact file has been identified as malicious before."
  }
  if (r.includes('double-extension masquerade')) {
    return 'This file is disguised to look like a harmless document or image, but its real file type is an executable. This is a classic trick used to fool people into opening malware.'
  }
  if (r.includes('impersonates a windows system process')) {
    return "This process is using the name of a trusted Windows system process, but it isn't running from the folder where that system process should live. Malware does this to hide in plain sight in a process list."
  }
  if (r.includes('spawned') && r.includes('macro')) {
    return 'A document or browser application launched a command-line tool — a pattern strongly associated with malicious macros or scripts hidden inside downloaded documents.'
  }
  if (r.includes('blocklist')) {
    return 'This process name matches a list of known malicious tools (such as password-dumping or remote-access utilities). Legitimate software essentially never uses these exact names.'
  }
  if (r.includes('commonly-abused location')) {
    return 'This file or program is running from a folder (like Temp or Downloads) that malware commonly uses to hide, because those folders are less likely to be manually checked. Many legitimate installers also use these folders temporarily, which is why this alone is only weak evidence.'
  }
  if (r.includes('high entropy')) {
    return 'This file is highly compressed or scrambled, which is typical of both packed malware and ordinary installers (which are compressed for smaller downloads). On its own, this is not a reliable signal — it needs to be combined with other evidence.'
  }
  if (r.includes('sustained high cpu')) {
    return 'This process has been consistently using a large share of CPU, which can indicate cryptomining malware — but is equally consistent with a legitimate heavy workload, so it always deserves a second look rather than an automatic conclusion.'
  }
  if (r.includes('network connections')) {
    return 'This process is holding an unusually large number of simultaneous network connections, a pattern associated with botnets or command-and-control malware, though some legitimate apps (torrent clients, servers) also do this.'
  }
  return reason
}

export function explainFinding(item) {
  const risk = riskLabel(item.risk_score)
  const wasCleared = item.reasons?.some((r) => r.toLowerCase().includes('cleared'))
  const explanations = (item.reasons || []).map((r) => ({
    raw: r,
    plain: explainReason(r),
  }))

  let verdict
  if (wasCleared) {
    verdict = 'This item was initially flagged by automated heuristics, but has since been verified as legitimate through a stronger signal (a valid digital signature). No action needed.'
  } else if (risk.label === 'Critical' || risk.label === 'High') {
    verdict = 'This combination of signals is unlikely to occur together on a legitimate file or process. Manual review is strongly recommended before dismissing this.'
  } else {
    verdict = 'This was flagged on a single weak signal. It could be entirely legitimate (many real installers and updaters trigger this same pattern) — treat this as "worth a glance," not "confirmed threat."'
  }

  return { risk, explanations, verdict, wasCleared }
}
