import { useState } from 'react'
import { LockKeyhole, ArrowRight } from 'lucide-react'
import { api, money } from '../lib'
import type { Plan } from '../types'
import { LibraryLogo } from '../components/LibraryLogo'
import { SignUpPage } from './SignUpPage'
export function LoginPage({
  publicInfo,
  demo,
  error,
  onLogin,
}: {
  publicInfo: { name: string; plans: Plan[] }
  demo: boolean
  error: string
  onLogin: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState('')
  const [signup, setSignup] = useState(false)
  const [userId, setUserId] = useState('')
  const [created, setCreated] = useState(false)
  const login = async (body: unknown) => {
    setBusy(true)
    setLocalError('')
    try {
      await api('/api/login', body)
      await onLogin()
    } catch (e) {
      setLocalError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <LibraryLogo className="login-logo" />
        <span className="eyebrow">{publicInfo.name}</span>
        <h1>
          Your library.
          <br />
          Always in view.
        </h1>
        <p>
          Students, seats, attendance, and fees.
          <br />
          One place to manage it all, wherever you are.
        </p>
        <div className="login-plans">
          {publicInfo.plans.map((plan) => (
            <div key={plan.id}>
              <strong>{plan.name}</strong>
              <span>{money(plan.fee)} / month</span>
            </div>
          ))}
        </div>
        <span className="login-footnote">
          A focused space for learning. A simpler way to manage it.
        </span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          {signup ? (
            <SignUpPage
              onCancel={() => setSignup(false)}
              onCreated={(id) => {
                setUserId(id)
                setCreated(true)
                setSignup(false)
                setLocalError('')
              }}
            />
          ) : (
            <>
              <span className="login-icon">
                <LockKeyhole size={24} />
              </span>
              <h2>Welcome back</h2>
              <p>Sign in to your library workspace.</p>
              {created && (
                <p className="alert success" role="status">
                  Account created. Sign in with your user ID. The owner will activate your library
                  access.
                </p>
              )}
              {(localError || error) && (
                <div className="alert error" role="alert">
                  {localError || error}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  void login({ userId: f.get('userId'), password: f.get('password') })
                }}
              >
                <label>
                  User ID or email
                  <input
                    name="userId"
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="username"
                    placeholder="Enter your user ID"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                  />
                </label>
                <button className="button primary full-width" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                  <ArrowRight size={16} />
                </button>
              </form>
              <button
                className="text-button auth-switch"
                disabled={busy}
                onClick={() => {
                  setSignup(true)
                  setLocalError('')
                }}
              >
                New user? Create an account
              </button>
              {demo && (
                <>
                  <div className="login-divider">Explore before you start</div>
                  <button
                    className="button secondary full-width"
                    disabled={busy}
                    onClick={() => void login({ demo: true })}
                  >
                    Open demo workspace
                    <ArrowRight size={16} />
                  </button>
                  <p className="helper centered">Includes sample students and transactions.</p>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
