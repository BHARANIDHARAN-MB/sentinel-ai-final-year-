import React, { useState } from 'react'
import { api } from '../api'

// step: 'password' | 'otp'
// mode: 'login' | 'register'

export default function LoginModal({ onClose, onLogin }) {
  const [mode, setMode] = useState('login')
  const [step, setStep] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [emailFailed, setEmailFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  function resetMessages() {
    setError('')
    setInfo('')
    setEmailFailed(false)
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    resetMessages()
    if (!email || !password) {
      setError('Enter both an email and password to continue.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        await api.register(email, password)
        setInfo('Account created. Signing you in…')
        const loginResult = await api.login(email, password)
        setStep('otp')
        if (loginResult.emailFailed) {
          setEmailFailed(true)
          setInfo(loginResult.message)
        } else {
          setInfo('Enter the 6-digit code sent to your email.')
        }
      } else {
        const loginResult = await api.login(email, password)
        setStep('otp')
        if (loginResult.emailFailed) {
          setEmailFailed(true)
          setInfo(loginResult.message)
        } else {
          setInfo('Enter the 6-digit code sent to your email.')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault()
    resetMessages()
    if (otp.length !== 6) {
      setError('Enter the 6-digit code.')
      return
    }

    setLoading(true)
    try {
      const { token, user } = await api.verifyOtp(email, otp)
      onLogin({ email: user.email, token })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function backToPassword() {
    setStep('password')
    setOtp('')
    resetMessages()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-surface border border-border rounded-lg w-full max-w-sm p-8 relative">
        <button
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute top-4 right-4 text-muted hover:text-ink transition-colors"
        >
          ✕
        </button>

        <p className="font-mono text-xs text-amber tracking-widest mb-2">
          {step === 'password' ? (mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT') : 'VERIFY'}
        </p>
        <h2 className="font-display text-2xl font-semibold mb-6">
          {step === 'password'
            ? mode === 'login'
              ? 'Access Sentinel AI'
              : 'Create your account'
            : 'Check your email'}
        </h2>

        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@rgcet.ac.in"
                className="focus-ring w-full bg-surface2 border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-muted/60"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="focus-ring w-full bg-surface2 border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-muted/60"
              />
              {mode === 'register' && (
                <p className="text-xs text-muted mt-1.5">At least 8 characters.</p>
              )}
            </div>

            {error && <p className="text-threat text-sm">{error}</p>}
            {info && !error && (
              <p className={`text-sm ${emailFailed ? 'text-amber' : 'text-verified'}`}>{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="focus-ring w-full bg-amber text-bg font-medium py-2.5 rounded-md hover:bg-amber/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Continue' : 'Create account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                resetMessages()
              }}
              className="focus-ring w-full text-xs text-muted hover:text-ink text-center pt-1"
            >
              {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1.5" htmlFor="otp">
                6-digit code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="focus-ring w-full bg-surface2 border border-border rounded-md px-3 py-2.5 text-center text-lg tracking-[0.5em] font-mono text-ink placeholder:text-muted/40"
              />
            </div>

            {error && <p className="text-threat text-sm">{error}</p>}
            {info && !error && (
              <p className={`text-sm ${emailFailed ? 'text-amber' : 'text-verified'}`}>{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="focus-ring w-full bg-amber text-bg font-medium py-2.5 rounded-md hover:bg-amber/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify and sign in'}
            </button>

            <button
              type="button"
              onClick={backToPassword}
              className="focus-ring w-full text-xs text-muted hover:text-ink text-center pt-1"
            >
              ← Back
            </button>
          </form>
        )}

        <p className="text-xs text-muted text-center pt-4 mt-4 border-t border-border">
          Codes expire after 5 minutes. Check your spam folder if it doesn't arrive.
        </p>
      </div>
    </div>
  )
}
