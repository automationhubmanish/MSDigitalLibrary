import { ArrowRight } from 'lucide-react'
import { Card, Stat, Empty, Badge } from '../components'
import { money, today, clockText, monthText } from '../lib'
import type { PageProps } from './pageTypes'
import { activeStudents, getMetrics } from '../utils/libraryMetrics'
import { FeeBadge } from '../components/FeeBadge'

export function DashboardPage({ state, setModal, navigate }: PageProps) {
  const m = getMetrics(state),
    active = activeStudents(state)
  const recent = [...state.attendance]
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
    .slice(0, 5)
  return (
    <>
      <div className="stats-grid">
        <Stat
          value={active.length}
          label="Active Students"
          note={`${active.filter((s) => s.joined.startsWith(today().slice(0, 7))).length} joined this month`}
        />
        <Stat
          value={`${m.occupied} / ${m.totalSeats}`}
          label="Seats Occupied"
          note={`${Math.round((m.occupied / m.totalSeats) * 100)}% occupancy`}
          color="blue"
        />
        <Stat
          value={money(m.collected)}
          label="Fee Collected"
          note={monthText(today().slice(0, 7))}
          color="purple"
        />
        <Stat
          value={money(m.due)}
          label="Fee Pending"
          note={`${m.pending.length} students · current month`}
          color="orange"
        />
      </div>
      <div className="two-columns">
        <Card
          title="Live Seat Occupancy"
          extra={
            <button className="text-button" onClick={() => navigate('seats')}>
              View seats
              <ArrowRight size={14} />
            </button>
          }
          className="overview-card"
        >
          <p className="muted">
            {m.occupied} occupied <span className="separator">•</span> {m.reserved} reserved{' '}
            <span className="separator">•</span> {m.available} available
          </p>
          <button
            className="occupancy-strip"
            aria-label="Open seat occupancy map"
            onClick={() => navigate('seats')}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className={
                  i / 24 < m.occupied / m.totalSeats
                    ? 'occupied'
                    : i / 24 < (m.occupied + m.reserved) / m.totalSeats
                      ? 'reserved'
                      : 'available'
                }
              />
            ))}
          </button>
          <p className="helper">
            {recent[0]
              ? `Last entry: ${recent[0].studentName} • Seat ${recent[0].seat} • ${clockText(recent[0].checkIn)}`
              : 'No check-ins yet. Select a student to get started.'}
          </p>
        </Card>
        <Card
          title="Membership Plans"
          extra={
            <button className="text-button" onClick={() => navigate('plans')}>
              Manage
              <ArrowRight size={14} />
            </button>
          }
          className="overview-card"
        >
          <div className="plan-summary">
            {state.plans
              .filter((p) => !p.archived)
              .map((p) => (
                <div key={p.id}>
                  <strong>{p.name}</strong>
                  <b className="green">{money(p.fee)}</b>
                  <span>{active.filter((s) => s.planId === p.id).length} students</span>
                </div>
              ))}
          </div>
        </Card>
      </div>
      <Card
        title="Recent Student Activity"
        extra={
          <button className="text-button" onClick={() => navigate('students')}>
            All students
            <ArrowRight size={14} />
          </button>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Seat</th>
                <th>Plan</th>
                <th>Fee status</th>
                <th>Check-in</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((a) => {
                const s = state.students.find((s) => s.id === a.studentId)!
                return (
                  <tr key={a.id}>
                    <td>
                      <button
                        className="name-button"
                        onClick={() => setModal({ type: 'student', student: s })}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td>{a.seat}</td>
                    <td>{state.plans.find((p) => p.id === s.planId)?.name}</td>
                    <td>
                      <FeeBadge state={state} student={s} />
                    </td>
                    <td>{clockText(a.checkIn)}</td>
                    <td>
                      <Badge tone={a.checkOut ? 'slate' : 'green'}>
                        {a.checkOut ? 'Checked out' : 'In library'}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!recent.length && <Empty>No attendance yet. Add students and check them in.</Empty>}
        </div>
      </Card>
    </>
  )
}
