export const PORTS = {
  report: 8004,
  fileScan: 8005,
  processMonitor: 8006,
  response: 8007,
  fileSearch: 8008,
  auth: 8009,
}

const base = (port) => `http://localhost:${port}`

async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res
}

export const api = {
  async healthCheck(port) {
    try {
      const res = await request(`${base(port)}/health`)
      return await res.json()
    } catch {
      return null
    }
  },

  async checkAllAgents() {
    const results = await Promise.all(
      Object.entries(PORTS).map(async ([name, port]) => ({
        name,
        port,
        ok: (await api.healthCheck(port)) !== null,
      }))
    )
    return results
  },

  async scanFiles() {
    const res = await request(`${base(PORTS.fileScan)}/scan-common-folders`, { method: 'POST' })
    return res.json()
  },

  async startFileScan() {
    const res = await request(`${base(PORTS.fileScan)}/scan-common-folders/start`, { method: 'POST' })
    return res.json() // { job_id }
  },

  async getFileScanProgress(jobId) {
    const res = await request(`${base(PORTS.fileScan)}/scan-progress/${jobId}`)
    return res.json()
  },

  async searchFile(query, category = 'any') {
    const res = await request(`${base(PORTS.fileSearch)}/search-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, category }),
    })
    return res.json()
  },

  async scanProcesses(cpuSampleSeconds = 1.5) {
    const res = await request(
      `${base(PORTS.processMonitor)}/scan-processes?cpu_sample_seconds=${cpuSampleSeconds}`
    )
    return res.json()
  },

  async generateReport(incidentPayload) {
    const res = await request(`${base(PORTS.report)}/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incidentPayload),
    })
    return res.blob()
  },

  async planResponse(incidentId, riskScore) {
    const res = await request(`${base(PORTS.response)}/plan-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: incidentId, risk_score: riskScore }),
    })
    return res.json()
  },

  // Auth endpoints return meaningful error messages in the JSON body even on
  // 4xx/5xx (e.g. "Incorrect code"), so these parse the body regardless of
  // status rather than using the generic `request()` helper that only
  // throws a raw status string.
  async register(email, password) {
    const res = await fetch(`${base(PORTS.auth)}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Registration failed (${res.status})`)
    return data
  },

  async login(email, password) {
    const res = await fetch(`${base(PORTS.auth)}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`)
    return data
  },

  async verifyOtp(email, otp) {
    const res = await fetch(`${base(PORTS.auth)}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Verification failed (${res.status})`)
    return data // { token, user }
  },
}
