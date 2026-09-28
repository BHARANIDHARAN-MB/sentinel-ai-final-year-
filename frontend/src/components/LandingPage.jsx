import React from 'react'

const AGENTS = [
  { name: 'File Scanner', angle: 20, dist: 70 },
  { name: 'Process Monitor', angle: 130, dist: 55 },
  { name: 'Response Agent', angle: 230, dist: 85 },
  { name: 'Report Agent', angle: 310, dist: 45 },
]

function RadarSignature() {
  const size = 340
  const c = size / 2

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-md" role="img" aria-label="Radar display showing four active detection agents">
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#E8A33D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E8A33D" stopOpacity="0" />
          <stop offset="100%" stopColor="#E8A33D" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <circle cx={c} cy={c} r={c - 2} fill="url(#radarGlow)" />
      {[1, 2, 3, 4].map((i) => (
        <circle key={i} cx={c} cy={c} r={(c - 10) * (i / 4)} fill="none" stroke="#232E47" strokeWidth="1" />
      ))}
      <line x1={c} y1="8" x2={c} y2={size - 8} stroke="#232E47" strokeWidth="1" />
      <line x1="8" y1={c} x2={size - 8} y2={c} stroke="#232E47" strokeWidth="1" />

      <g className="radar-sweep" style={{ transformOrigin: `${c}px ${c}px` }}>
        <path d={`M ${c} ${c} L ${c} 8 A ${c - 8} ${c - 8} 0 0 1 ${c + (c - 8) * Math.sin(0.6)} ${c - (c - 8) * Math.cos(0.6)} Z`} fill="url(#sweepGrad)" />
      </g>

      {AGENTS.map((agent, i) => {
        const rad = (agent.angle * Math.PI) / 180
        const x = c + agent.dist * Math.cos(rad)
        const y = c + agent.dist * Math.sin(rad)
        return (
          <g key={agent.name}>
            <circle cx={x} cy={y} r="4" fill="none" stroke="#E8A33D" strokeWidth="1.5" className="ping-ring" style={{ animationDelay: `${i * 0.7}s` }} />
            <circle cx={x} cy={y} r="3" fill="#E8A33D" className="blip" style={{ animationDelay: `${i * 0.4}s` }} />
            <text x={x} y={y - 12} textAnchor="middle" fill="#7C8698" fontSize="9" fontFamily="JetBrains Mono, monospace">
              {agent.name}
            </text>
          </g>
        )
      })}

      <circle cx={c} cy={c} r="3" fill="#E4E7EC" />
    </svg>
  )
}

export default function LandingPage({ onGetStarted }) {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="font-display font-semibold text-lg tracking-tight">
          SENTINEL<span className="text-amber">AI</span>
        </div>
        <button
          onClick={onGetStarted}
          className="focus-ring px-5 py-2 rounded-md border border-border text-sm font-medium text-ink hover:border-amber hover:text-amber transition-colors"
        >
          Sign in →
        </button>
      </nav>

      <main className="flex-1 flex items-center max-w-7xl mx-auto w-full px-8 py-12">
        <div className="grid md:grid-cols-2 gap-16 items-center w-full">
          <div>
            <p className="font-mono text-xs text-amber tracking-widest mb-4">MULTI-AGENT THREAT RESPONSE</p>
            <h1 className="font-display text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight mb-6">
              Four agents watching your system, all the time.
            </h1>
            <p className="text-muted text-lg leading-relaxed mb-8 max-w-md">
              Sentinel AI scans your files, watches your processes, verifies
              what it finds against real digital signatures, and contains
              genuine threats — while telling you exactly why, in plain
              English, for everything it flags.
            </p>
            <div className="flex gap-4">
              <button
                onClick={onGetStarted}
                className="focus-ring px-6 py-3 rounded-md bg-amber text-bg font-medium hover:bg-amber/90 transition-colors"
              >
                Get started
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <RadarSignature />
          </div>
        </div>
      </main>

      <section className="border-t border-border">
        <div className="max-w-7xl mx-auto px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ['01', 'File Scanner', 'Hash, entropy, and signature verification against real files'],
            ['02', 'Process Monitor', 'Live OS process table, not a simulation'],
            ['03', 'Response Agent', 'Kill, quarantine, or block — with full audit trail'],
            ['04', 'Report Agent', 'Every incident, explained and exportable'],
          ].map(([n, title, desc]) => (
            <div key={n}>
              <p className="font-mono text-xs text-amberDim mb-2">{n}</p>
              <h3 className="font-display font-medium text-ink mb-1">{title}</h3>
              <p className="text-sm text-muted leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
