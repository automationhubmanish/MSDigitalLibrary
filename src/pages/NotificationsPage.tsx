import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Send, Megaphone, BellRing } from 'lucide-react'
import { Card, Stat, Empty, Badge } from '../components'
import { api, money, dateText, clockText, isPaid, reminderMessage } from '../lib'
import type { PageProps } from './pageTypes'
import { activeStudents } from '../utils/libraryMetrics'

type Kind = 'fee' | 'announcement' | 'alert'
interface NotificationData {
  mode: 'simulation' | 'live'
  channel: 'whatsapp' | 'sms'
  ready: Record<Kind, boolean>
  drafts: Partial<Record<Kind, string>>
  history: {
    id: string
    created: string
    kind: Kind
    mode: string
    studentId: string
    studentName: string
    message: string
    status: string
    error?: string
    providerId?: string
  }[]
}

export function NotificationsPage({
  state,
  setModal,
  notify,
}: PageProps & { notify: (message: string) => void }) {
  const [studentId, setStudentId] = useState(activeStudents(state)[0]?.id || '')
  const [data, setData] = useState<NotificationData | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [alert, setAlert] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')
  const initialized = useRef(false)
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null)
  const owner = state.role === 'owner'
  const active = activeStudents(state),
    selected = active.find((s) => s.id === studentId) || active[0],
    pending = active.filter((s) => !isPaid(state, s))
  const message = selected ? reminderMessage(state, selected) : ''
  const load = useCallback(async () => {
    const next = await api<NotificationData>('/api/notifications')
    setData(next)
    if (!initialized.current) {
      setAnnouncement(next.drafts.announcement || '')
      setAlert(next.drafts.alert || '')
      initialized.current = true
    }
  }, [])
  useEffect(() => {
    const refresh = () => {
      void load().catch((e: Error) => setError(e.message))
    }
    refresh()
    const timer = setInterval(refresh, 3000)
    return () => clearInterval(timer)
  }, [load])
  const simulation = data?.mode === 'simulation'
  const send = async (kind: Kind, text = '', target?: string) => {
    if (busy) return
    const signature = JSON.stringify({ kind, text, studentId: target })
    if (pendingRequest.current?.signature !== signature)
      pendingRequest.current = { signature, id: crypto.randomUUID() }
    setBusy(kind)
    setError('')
    try {
      const result = await api<{ queued: number; skipped?: number; mode: string }>(
        '/api/notifications/send',
        { requestId: pendingRequest.current.id, kind, text, studentId: target },
      )
      pendingRequest.current = null
      notify(
        result.queued
          ? `${result.queued} ${result.mode === 'simulation' ? 'demo notifications simulated. No messages sent.' : 'notifications queued. See history for provider acceptance.'}${result.skipped ? ` ${result.skipped} duplicate recipients skipped.` : ''}`
          : 'Already requested today. Duplicate messages skipped.',
      )
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  const saveDraft = async (kind: 'announcement' | 'alert', text: string) => {
    setBusy(`draft-${kind}`)
    setError('')
    try {
      await api('/api/notifications/draft', { kind, text })
      notify('Draft saved to the library server.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  const history = (data?.history || []).filter(
    (item) => historyFilter === 'all' || item.kind === historyFilter,
  )
  return (
    <>
      <div className="stats-grid">
        <Stat
          value={active.length}
          label="Active Recipients"
          note="All active student mobile numbers"
          color="blue"
        />
        <Stat
          value={pending.length}
          label="Fees Due"
          note="Unpaid for the current month"
          color="purple"
        />
        <Stat
          value={data ? (data.channel === 'whatsapp' ? 'WhatsApp' : 'SMS') : 'Loading…'}
          label="Notification Channel"
          note={simulation ? 'Demo simulation' : 'Provider sends from the server'}
        />
        <Stat
          value={
            data
              ? simulation
                ? 'Demo'
                : Object.values(data.ready).every(Boolean)
                  ? 'Ready'
                  : 'Setup needed'
              : 'Loading…'
          }
          label="Sending Status"
          note={simulation ? 'No messages leave this workspace' : 'Owner can send notifications'}
          color="amber"
        />
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="info-strip">
        {simulation
          ? 'Demo mode: try all three send actions with sample students. Results are saved as simulated.'
          : 'Notifications go to saved student mobile numbers. Accepted means the provider received the request; delivery is not yet confirmed.'}{' '}
        {!owner && ' Only the owner can send.'}
      </div>
      <div className="two-columns">
        <Card title="Fee Payment Reminders">
          <p>Send a personal reminder to every student with unpaid fees for the current month.</p>
          <p className="helper">
            {pending.length} recipients · Paid and archived students are excluded. One reminder per
            student per day.
          </p>
          <button
            className="button primary"
            disabled={!owner || !!busy || !data?.ready.fee || !pending.length}
            onClick={() => void send('fee')}
          >
            <Send size={15} />
            {busy === 'fee'
              ? 'Processing…'
              : `${simulation ? 'Simulate' : 'Send'} fee reminders (${pending.length})`}
          </button>
          {data && !data.ready.fee && (
            <p className="helper">
              Connect the messaging provider and fee template in the server .env file.
            </p>
          )}
          <p className="helper">
            Edit the reminder wording in Settings. Payments are collected by the library.
          </p>
        </Card>
        <Card title="Notification Preview">
          <label className="preview-select">
            Student
            <select value={selected?.id || ''} onChange={(e) => setStudentId(e.target.value)}>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="message-preview">
              <strong>{state.settings.name}</strong>
              <p>{message}</p>
            </div>
          ) : (
            <Empty>Add a student to preview a reminder.</Empty>
          )}
          <button
            className="text-button copy-button"
            disabled={!selected}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message)
                notify('Reminder copied.')
              } catch {
                notify('Clipboard unavailable. Select and copy the preview text.')
              }
            }}
          >
            <Copy size={13} />
            Copy message
          </button>
        </Card>
      </div>
      <div className="two-columns">
        {(['announcement', 'alert'] as const).map((kind) => {
          const value = kind === 'announcement' ? announcement : alert
          const setValue = kind === 'announcement' ? setAnnouncement : setAlert
          return (
            <Card
              key={kind}
              title={
                kind === 'announcement' ? 'Announcement to All Students' : 'Alert to All Students'
              }
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void send(kind, value)
                }}
              >
                <label>
                  {kind === 'announcement' ? 'Announcement message' : 'Alert message'}
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    minLength={3}
                    required
                    disabled={!owner || !data || !!busy}
                    placeholder={
                      kind === 'announcement'
                        ? 'Example: New evening study slots are available from Monday.'
                        : 'Example: The library will close at 6 PM today due to maintenance.'
                    }
                  />
                </label>
                <p className="helper">
                  {active.length} active students · {value.length}/1,000 characters ·{' '}
                  {state.settings.name} is included.
                </p>
                <div className="profile-actions">
                  <button
                    className={kind === 'alert' ? 'button blue-button' : 'button primary'}
                    disabled={
                      !owner ||
                      !!busy ||
                      !data?.ready[kind] ||
                      !active.length ||
                      value.trim().length < 3
                    }
                  >
                    {kind === 'alert' ? <BellRing size={15} /> : <Megaphone size={15} />}
                    {busy === kind
                      ? 'Processing…'
                      : `${simulation ? 'Simulate' : 'Send'} ${kind} to all`}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!owner || !data || !!busy}
                    onClick={() => void saveDraft(kind, value)}
                  >
                    Save draft
                  </button>
                </div>
                {data && !data.ready[kind] && (
                  <p className="helper">
                    The messaging provider and {kind} template need configuration.
                  </p>
                )}
              </form>
            </Card>
          )
        })}
      </div>
      <Card
        title="Students Needing a Reminder"
        extra={<span className="muted">{pending.length} unpaid memberships</span>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Plan / Amount</th>
                <th>Phone</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>
                    {state.plans.find((p) => p.id === s.planId)?.name} · {money(s.monthlyFee)}
                  </td>
                  <td>{s.phone}</td>
                  <td>
                    <div className="profile-actions">
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: 'reminder', student: s })}
                      >
                        Preview
                      </button>
                      <button
                        className="button secondary small"
                        disabled={!owner || !!busy || !data?.ready.fee}
                        onClick={() => void send('fee', '', s.id)}
                      >
                        {simulation ? 'Simulate reminder' : 'Send reminder'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pending.length && <Empty>No unpaid memberships this month.</Empty>}
        </div>
      </Card>
      <Card
        title="Notification History"
        extra={
          <select
            aria-label="Filter notification history"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
          >
            <option value="all">All notifications</option>
            <option value="fee">Fee reminders</option>
            <option value="announcement">Announcements</option>
            <option value="alert">Alerts</option>
          </select>
        }
      >
        <p className="helper">
          Latest 300 recipient records. Identical announcements and alerts are sent at most once per
          student per day. Check the provider console for delivery confirmation or failed/unknown
          results before sending again.
        </p>
        <div className="table-wrap notification-history">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Type / Date</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item, i) => (
                <tr key={`${item.id}-${item.studentId}-${i}`}>
                  <td>
                    <strong>{item.studentName}</strong>
                  </td>
                  <td>
                    {item.kind}
                    <small className="block-helper">
                      {dateText(item.created)} {clockText(item.created)}
                    </small>
                  </td>
                  <td>
                    <details>
                      <summary>View message</summary>
                      <p className="notification-message">{item.message}</p>
                      {item.providerId && <small>{item.providerId}</small>}
                      {item.error && <p className="amber">{item.error}</p>}
                    </details>
                  </td>
                  <td>
                    <Badge
                      tone={
                        item.status === 'accepted'
                          ? 'green'
                          : ['failed', 'unknown'].includes(item.status)
                            ? 'amber'
                            : 'slate'
                      }
                    >
                      {item.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <Empty>No notifications recorded yet.</Empty>}
        </div>
      </Card>
    </>
  )
}
