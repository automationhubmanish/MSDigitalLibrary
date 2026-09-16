import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, Empty, Badge, Detail } from '../components'
import { money, dateText, clockText, initials, isPaid, activeVisit, localDay } from '../lib'
import { useNow } from '../useNow'
import type { PageProps } from './pageTypes'
import { activeStudents } from '../utils/libraryMetrics'
import { FeeBadge } from '../components/FeeBadge'
import { AttendanceButton } from '../components/AttendanceButton'
import { studyWindow, studentHours } from '../utils/availability'

export function StudentsPage({
  state,
  setModal,
  toggleAttendance,
}: PageProps & { toggleAttendance: (id: string) => Promise<void> }) {
  const now = useNow()
  const [search, setSearch] = useState(''),
    [plan, setPlan] = useState('all'),
    [fee, setFee] = useState('all'),
    [seat, setSeat] = useState('all'),
    [status, setStatus] = useState('active')
  const [selectedId, setSelectedId] = useState(activeStudents(state)[0]?.id || ''),
    [page, setPage] = useState(0)
  const filtered = state.students.filter(
    (s) =>
      (status === 'archived' ? s.archivedAt : !s.archivedAt) &&
      `${s.name} ${s.phone} ${s.id}`.toLowerCase().includes(search.toLowerCase()) &&
      (plan === 'all' || s.planId === plan) &&
      (fee === 'all' || isPaid(state, s) === (fee === 'paid')) &&
      (seat === 'all' || (seat === 'assigned' ? !!s.seat : !s.seat)),
  )
  const selected = filtered.find((s) => s.id === selectedId) || filtered[0]
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1))
  const visit = selected ? activeVisit(state, selected.id) : null
  const attendance = selected ? state.attendance.filter((a) => a.studentId === selected.id) : []
  const days = new Set(
    attendance
      .filter((a) => new Date(a.checkIn).getTime() >= now - 30 * 86400000)
      .map((a) => localDay(a.checkIn)),
  ).size
  const resetFilter = (fn: (value: string) => void, value: string) => {
    fn(value)
    setPage(0)
  }
  return (
    <>
      <div className="filter-bar card">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search students"
            placeholder="Search name, phone or ID"
            value={search}
            onChange={(e) => resetFilter(setSearch, e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by plan"
          value={plan}
          onChange={(e) => resetFilter(setPlan, e.target.value)}
        >
          <option value="all">Plan: All</option>
          {state.plans.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by fee"
          value={fee}
          onChange={(e) => resetFilter(setFee, e.target.value)}
        >
          <option value="all">Fee: All</option>
          <option value="paid">Paid</option>
          <option value="due">Due</option>
        </select>
        <select
          aria-label="Filter by seat"
          value={seat}
          onChange={(e) => resetFilter(setSeat, e.target.value)}
        >
          <option value="all">Seat: All</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          aria-label="Filter membership status"
          value={status}
          onChange={(e) => resetFilter(setStatus, e.target.value)}
        >
          <option value="active">Active students</option>
          <option value="archived">Archived students</option>
        </select>
      </div>
      <div className="student-layout">
        <Card
          title={`${filtered.length} ${status === 'archived' ? 'Archived' : 'Active'} Students`}
          className="students-card"
        >
          <div className="table-wrap">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Plan</th>
                  <th>Seat</th>
                  <th>Paid through</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(visiblePage * 10, visiblePage * 10 + 10).map((s) => (
                  <tr
                    key={s.id}
                    className={selected?.id === s.id ? 'selected' : ''}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td>
                      <button className="student-name" onClick={() => setSelectedId(s.id)}>
                        <strong>{s.name}</strong>
                        <span>
                          {s.id} • {s.phone}
                        </span>
                      </button>
                    </td>
                    <td>{state.plans.find((p) => p.id === s.planId)?.name}</td>
                    <td>{s.seat || '—'}</td>
                    <td>{s.validUntil ? dateText(s.validUntil) : '—'}</td>
                    <td>
                      <FeeBadge state={state} student={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <Empty>No matching students. Try changing your filters.</Empty>}
          </div>
          <div className="pagination">
            <span>
              {filtered.length
                ? `${visiblePage * 10 + 1}–${Math.min(visiblePage * 10 + 10, filtered.length)} of ${filtered.length}`
                : '0 students'}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous students"
                disabled={visiblePage === 0}
                onClick={() => setPage(visiblePage - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Next students"
                disabled={(visiblePage + 1) * 10 >= filtered.length}
                onClick={() => setPage(visiblePage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </Card>
        <Card className="student-profile">
          {selected ? (
            <>
              <div className="avatar">{initials(selected.name)}</div>
              <h2 className="profile-name">{selected.name}</h2>
              <p className="helper">Student ID&nbsp; {selected.id}</p>
              <div className="detail-list">
                <Detail label="Phone">{selected.phone}</Detail>
                <Detail label="Seat">{selected.seat || 'Unassigned'}</Detail>
                <Detail label="Plan">
                  {state.plans.find((p) => p.id === selected.planId)?.name} ·{' '}
                  {money(selected.monthlyFee)}/month
                </Detail>
                <Detail label="Study window">{studyWindow(state, selected)}</Detail>
                <Detail label="Daily hours">{studentHours(state, selected)} hours</Detail>
                <Detail label="Joining date">{dateText(selected.joined, true)}</Detail>
                <Detail label="Paid through">{dateText(selected.validUntil, true)}</Detail>
                <Detail label="Attendance">{days} / 30 days</Detail>
                <Detail label="Last check-in">
                  {attendance.length
                    ? `${dateText([...attendance].sort((a, b) => b.checkIn.localeCompare(a.checkIn))[0].checkIn)} · ${clockText([...attendance].sort((a, b) => b.checkIn.localeCompare(a.checkIn))[0].checkIn)}`
                    : 'No visits yet'}
                </Detail>
              </div>
              {selected.notes && <p className="student-notes">{selected.notes}</p>}
              {selected.archivedAt ? (
                <div>
                  <Badge tone="slate">Archived {dateText(selected.archivedAt)}</Badge>
                  {state.role === 'owner' && (
                    <div className="profile-actions">
                      <button
                        className="button secondary small"
                        onClick={() => setModal({ type: 'student', student: selected })}
                      >
                        Edit details
                      </button>
                      <button
                        className="button primary small"
                        onClick={() => setModal({ type: 'studentRestore', student: selected })}
                      >
                        Restore membership
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="profile-actions">
                    <button
                      className="button secondary small"
                      onClick={() => setModal({ type: 'student', student: selected })}
                    >
                      Edit
                    </button>
                    <button
                      className="button primary small"
                      onClick={() => setModal({ type: 'payment', student: selected })}
                    >
                      Collect Fee
                    </button>
                    <AttendanceButton
                      id={selected.id}
                      inLibrary={!!visit}
                      toggle={toggleAttendance}
                    />
                  </div>
                  <button
                    className="text-button archive-button"
                    onClick={() => setModal({ type: 'archive', student: selected })}
                  >
                    Archive membership
                  </button>
                </>
              )}
            </>
          ) : (
            <Empty>Select a student to see their details.</Empty>
          )}
        </Card>
      </div>
    </>
  )
}
