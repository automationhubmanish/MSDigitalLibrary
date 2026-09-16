import { useEffect, useState } from 'react'
import { Card } from '../components'
import { api } from '../lib'
import type { LibraryState } from '../types'

interface Account {
  userId: string
  name: string
  role: string
  studentId: string | null
}
export function AccountManagement({ state }: { state: LibraryState }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => setAccounts(await api<Account[]>('/api/accounts'))
  useEffect(() => {
    void api<Account[]>('/api/accounts')
      .then(setAccounts)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <Card title="User Accounts">
      <p className="helper">
        Verify who registered before linking a membership or granting staff access. Access changes
        sign that account out.
      </p>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void load().catch((e: Error) => setError(e.message))}
      >
        Refresh accounts
      </button>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="alert success">
          {message}
        </p>
      )}
      {!accounts.length && <p className="helper">New sign-ups will appear here.</p>}
      <div className="account-list">
        {accounts.map((account) => (
          <form
            key={`${account.userId}-${account.role}-${account.studentId}`}
            aria-label={`Access for ${account.userId}`}
            onSubmit={async (e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              setBusy(true)
              setError('')
              setMessage('')
              try {
                await api('/api/accounts/access', {
                  userId: account.userId,
                  role: data.get('role'),
                  studentId: data.get('studentId'),
                })
                await load()
                setMessage(`Access saved for ${account.userId}. They can sign in again.`)
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <fieldset disabled={busy}>
              <h3>{account.name}</h3>
              <p className="helper">
                {account.userId} · {account.role}
              </p>
              <label>
                Access level
                <select name="role" defaultValue={account.role}>
                  <option value="pending">Awaiting activation</option>
                  <option value="student">Student — own membership only</option>
                  <option value="staff">Staff — library management</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label>
                Student membership
                <select name="studentId" defaultValue={account.studentId || ''}>
                  <option value="">Select for student access</option>
                  {state.students
                    .filter((s) => !s.archivedAt)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.id}
                      </option>
                    ))}
                </select>
              </label>
              <button className="button primary small">Save access</button>
            </fieldset>
          </form>
        ))}
      </div>
    </Card>
  )
}
