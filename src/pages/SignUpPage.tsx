import { useState } from 'react'
import { api } from '../lib'

export function SignUpPage({
  onCreated,
  onCancel,
  requiresEmail = false,
}: {
  onCreated: (userId: string, confirmEmail?: boolean) => void
  onCancel: () => void
  requiresEmail?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <>
      <h2>Create your account</h2>
      <p>Choose a user ID and password for MS Digital Library.</p>
      <p className="helper">
        The owner will link your membership or approve staff access after you sign up.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          if (data.get('password') !== data.get('confirmPassword')) {
            setError('Passwords do not match.')
            return
          }
          setBusy(true)
          setError('')
          try {
            const result = await api<{ userId: string; confirmEmail?: boolean }>('/api/signup', {
              name: data.get('name'),
              userId: data.get('userId'),
              password: data.get('password'),
              ...(requiresEmail ? { email: data.get('email') } : {}),
            })
            onCreated(result.userId, result.confirmEmail)
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          {requiresEmail && (
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
              <span className="helper">We’ll send an email to confirm your account.</span>
            </label>
          )}
          <label>
            Full name
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label>
            User ID
            <input
              name="userId"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}"
              minLength={3}
              maxLength={40}
              placeholder="For example: manish01"
              required
            />
          </label>
          <p className="helper">
            3–40 characters: letters, numbers, dots, underscores or hyphens. Start with a letter or
            number.
          </p>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <p className="helper">Use at least 12 characters.</p>
          <label>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full-width">
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <button type="button" className="text-button auth-switch" onClick={onCancel}>
            Already have an account? Sign in
          </button>
        </fieldset>
      </form>
    </>
  )
}
