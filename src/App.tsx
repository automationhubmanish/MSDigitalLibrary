import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Armchair,
  IndianRupee,
  Clock3,
  ChartNoAxesCombined,
  Bell,
  Settings,
  Menu,
  LogOut,
  Plus,
  RefreshCw,
  Download,
  X,
} from 'lucide-react'
import type { LibraryState, Modal, Page, Plan } from './types'
import { api, today, monthText, downloadCsv } from './lib'
import { DashboardPage } from './pages/DashboardPage'
import { StudentsPage } from './pages/StudentsPage'
import { SeatsAttendancePage } from './pages/SeatsAttendancePage'
import { FeesPaymentsPage } from './pages/FeesPaymentsPage'
import { TimingPlansPage } from './pages/TimingPlansPage'
import { ReportsPage } from './pages/ReportsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { StudentPortalPage } from './pages/StudentPortalPage'
import { LibraryLogo } from './components/LibraryLogo'
import { RecordModal } from './forms'
import './App.css'

const navigation = [
  { id: 'dashboard', label: 'Dashboard', title: 'Library Overview', icon: LayoutDashboard },
  { id: 'students', label: 'Students', title: 'Students & Memberships', icon: Users },
  { id: 'seats', label: 'Seats & Attendance', title: 'Seats & Attendance', icon: Armchair },
  { id: 'fees', label: 'Fees & Payments', title: 'Fees & Payments', icon: IndianRupee },
  { id: 'plans', label: 'Timings & Plans', title: 'Timing & Membership Plans', icon: Clock3 },
  { id: 'reports', label: 'Reports', title: 'Reports & Analytics', icon: ChartNoAxesCombined },
  { id: 'notifications', label: 'Notifications', title: 'Fee Reminder Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', title: 'Library Settings', icon: Settings },
] as const
const initialPage = () =>
  navigation.some((n) => n.id === location.hash.slice(1))
    ? (location.hash.slice(1) as Page)
    : 'dashboard'

function App() {
  const [state, setState] = useState<LibraryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)
  const [publicInfo, setPublicInfo] = useState<{
    name: string
    plans: Plan[]
    requiresEmail?: boolean
  }>({
    name: 'MS Digital Library',
    plans: [],
  })
  const [page, setPage] = useState<Page>(initialPage)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [synced, setSynced] = useState<Date | null>(null)
  const [month, setMonth] = useState(today().slice(0, 7))
  const refresh = useCallback(async () => {
    try {
      const data = await api<LibraryState>('/api/state')
      setState((previous) => (!previous || data.revision >= previous.revision ? data : previous))
      setSynced(new Date())
      setError('')
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setState(null)
        setModal(null)
      } else setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  const signedIn = !!state
  useEffect(() => {
    void api<{ demo: boolean; name: string; plans: Plan[]; requiresEmail?: boolean }>('/api/config')
      .then((c) => {
        setDemo(c.demo)
        setPublicInfo({ name: c.name, plans: c.plans, requiresEmail: c.requiresEmail })
      })
      .catch(() => setError('Cannot connect to the server. Start the app with npm run dev.'))
    void Promise.resolve().then(refresh)
  }, [refresh])
  useEffect(() => {
    if (!signedIn) return
    const timer = setInterval(() => void refresh(), 15000)
    return () => clearInterval(timer)
  }, [signedIn, refresh])
  useEffect(() => {
    const handle = () => {
      setPage(initialPage())
      setMobileOpen(false)
    }
    addEventListener('hashchange', handle)
    return () => removeEventListener('hashchange', handle)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(timer)
  }, [toast])
  const navigate = (next: Page) => {
    window.location.assign(`#${next}`)
    setPage(next)
    setMobileOpen(false)
  }
  const mutate = async (action: unknown, message: string) => {
    try {
      const next = await api<LibraryState>('/api/actions', { revision: state?.revision, action })
      setState(next)
      setPublicInfo((previous) => ({
        ...previous,
        name: next.settings.name,
        plans: next.plans.filter((p) => !p.archived),
      }))
      setSynced(new Date())
      setError('')
      setToast(message)
    } catch (e) {
      if ((e as { status?: number }).status === 409 || (e as { status?: number }).status === 401)
        await refresh()
      throw e
    }
  }
  const toggleAttendance = async (id: string) => {
    try {
      await mutate({ type: 'attendance.toggle', id }, 'Attendance updated.')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const exportPayments = () => {
    if (!state) return
    downloadCsv(
      `fee-collection-${month}`,
      [
        'Receipt',
        'Student',
        'Plan',
        'Amount INR',
        'Billing month',
        'Mode',
        'Recorded at',
        'Reference',
      ],
      state.payments
        .filter((p) => p.month === month && !p.voided)
        .map((p) => [
          p.id,
          p.studentName,
          p.planName,
          p.amount,
          p.month,
          p.mode,
          p.date,
          p.reference,
        ]),
    )
    setToast('Fee report downloaded as CSV. Open it in Excel.')
  }
  if (loading)
    return (
      <div className="loading-screen">
        <LibraryLogo />
        <p>Opening your library…</p>
      </div>
    )
  if (!state)
    return <LoginPage publicInfo={publicInfo} demo={demo} error={error} onLogin={refresh} />
  if (state.role === 'pending' || state.role === 'student')
    return <StudentPortalPage state={state} refresh={refresh} />
  const current = navigation.find((n) => n.id === page)!
  const shared = { state, setModal, navigate }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <LibraryLogo />
          <strong>{state.settings.name}</strong>
          <span>{state.role === 'owner' ? 'Owner Control Center' : 'Staff Workspace'}</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              href={`#${id}`}
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={17} strokeWidth={1.6} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-status">
            <span className={`status-dot ${error ? 'offline' : ''}`} />
            <span>
              {state.demo ? 'Demo workspace' : 'Library connected'}
              <small>
                {state.demo ? 'Sample records · saved on server' : 'Changes saved to your library'}
              </small>
            </span>
          </div>
          <button
            className="nav-item logout"
            onClick={async () => {
              try {
                await api('/api/logout', {})
                setState(null)
                setModal(null)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <main id="main-content" className="main-content">
        <header className="page-header">
          <div className="page-title">
            <button
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h1>{current.title}</h1>
          </div>
          <div className="header-actions">
            {page === 'dashboard' && (
              <>
                <time className="header-date">
                  {new Date().toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata',
                  })}
                </time>
                <button className="button primary" onClick={() => setModal({ type: 'student' })}>
                  <Plus size={16} />
                  Add Student
                </button>
              </>
            )}
            {page === 'students' && (
              <button className="button primary" onClick={() => setModal({ type: 'student' })}>
                <Plus size={16} />
                Add New Student
              </button>
            )}
            {page === 'seats' && (
              <button className="sync-label" onClick={() => void refresh()}>
                <RefreshCw size={13} />
                {error
                  ? 'Retry connection'
                  : `Updated ${synced?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
              </button>
            )}
            {(page === 'fees' || page === 'reports') && (
              <>
                <label className="sr-only" htmlFor="report-month">
                  Report month
                </label>
                <input
                  id="report-month"
                  className="month-picker"
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value)
                  }}
                />
                {page === 'fees' && (
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'payment', month })}
                  >
                    <Plus size={15} />
                    Collect Fee
                  </button>
                )}
                <button
                  className={`button ${page === 'reports' ? 'blue-button' : 'secondary'}`}
                  onClick={exportPayments}
                >
                  <Download size={15} />
                  Export CSV
                </button>
              </>
            )}
            {page === 'plans' && state.role === 'owner' && (
              <button className="button primary" onClick={() => setModal({ type: 'plan' })}>
                <Plus size={15} />
                Add New Plan
              </button>
            )}
            {page === 'notifications' && (
              <span className="connection-pill">
                <span className="status-dot amber-dot" />
                Reminders & broadcasts
              </span>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="alert error">
            <span>{error} Your last loaded records remain visible.</span>
            <button className="text-button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        <div className="page-body" key={page}>
          {page === 'dashboard' && <DashboardPage {...shared} />}
          {page === 'students' && <StudentsPage {...shared} toggleAttendance={toggleAttendance} />}
          {page === 'seats' && (
            <SeatsAttendancePage {...shared} toggleAttendance={toggleAttendance} />
          )}
          {page === 'fees' && <FeesPaymentsPage {...shared} month={month} />}
          {page === 'plans' && <TimingPlansPage {...shared} mutate={mutate} />}
          {page === 'reports' && (
            <ReportsPage
              {...shared}
              month={month}
              exportPayments={exportPayments}
              notify={setToast}
            />
          )}
          {page === 'notifications' && <NotificationsPage {...shared} notify={setToast} />}
          {page === 'settings' && <SettingsPage state={state} mutate={mutate} />}
        </div>
        <footer className="page-footer">
          <span>
            {state.demo
              ? 'Sample data for preview · Changes persist in this demo workspace'
              : 'MS Digital Library · All times in India Standard Time'}
          </span>
          <span>
            {page === 'fees' || page === 'reports'
              ? `Billing period: ${monthText(month)}`
              : 'Refreshes every 15 seconds'}
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <RecordModal modal={modal} state={state} onClose={() => setModal(null)} mutate={mutate} />
      )}
    </div>
  )
}

export default App
