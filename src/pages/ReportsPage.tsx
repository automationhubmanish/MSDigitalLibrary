import { ArrowDownToLine, Printer } from 'lucide-react'
import { Card, Stat, Detail, RevenueChart } from '../components'
import {
  money,
  dateText,
  clockText,
  monthText,
  getSeats,
  activeVisit,
  localDay,
  downloadCsv,
} from '../lib'
import type { PageProps } from './pageTypes'
import { activeStudents, getMetrics } from '../utils/libraryMetrics'

export function ReportsPage({
  state,
  month,
  exportPayments,
  notify,
}: PageProps & { month: string; exportPayments: () => void; notify: (text: string) => void }) {
  const seats = getSeats(state.settings)
  const m = getMetrics(state, month),
    active = activeStudents(state)
  const visits = state.attendance.filter((a) => localDay(a.checkIn).startsWith(month))
  const distinct = new Set(visits.map((a) => a.studentId)).size
  const rows = state.settings.seatRows
    .map((row) => ({
      row,
      occupied: state.attendance.filter((a) => !a.checkOut && a.seat.startsWith(row)).length,
    }))
    .sort((a, b) => b.occupied - a.occupied)
  const distribution = state.plans
    .map((p) => ({ ...p, count: active.filter((s) => s.planId === p.id).length }))
    .sort((a, b) => b.count - a.count)
  const exportReport = (kind: string) => {
    if (kind === 'fees') {
      exportPayments()
      return
    }
    if (kind === 'attendance')
      downloadCsv(
        `attendance-${month}`,
        ['Student', 'Seat', 'Check-in IST', 'Check-out IST'],
        visits.map((a) => [
          a.studentName,
          a.seat,
          `${dateText(a.checkIn, true)} ${clockText(a.checkIn)}`,
          a.checkOut ? `${dateText(a.checkOut, true)} ${clockText(a.checkOut)}` : 'In library',
        ]),
      )
    if (kind === 'dues')
      downloadCsv(
        `pending-fees-${month}`,
        ['Student ID', 'Student', 'Phone', 'Amount INR', 'Month'],
        m.pending.map((s) => [s.id, s.name, s.phone, s.monthlyFee, month]),
      )
    if (kind === 'students')
      downloadCsv(
        'student-database',
        [
          'ID',
          'Name',
          'Phone',
          'Plan',
          'Monthly fee INR',
          'Seat',
          'Start time',
          'Joined',
          'Paid through',
          'Status',
        ],
        state.students.map((s) => [
          s.id,
          s.name,
          s.phone,
          state.plans.find((p) => p.id === s.planId)?.name || '',
          s.monthlyFee,
          s.seat,
          s.startTime,
          s.joined,
          s.validUntil,
          s.archivedAt ? 'Archived' : 'Active',
        ]),
      )
    if (kind === 'seats')
      downloadCsv(
        'current-seat-occupancy',
        ['Seat', 'Student', 'Status'],
        seats.map((seat) => {
          const s = active.find((s) => s.seat === seat)
          return [
            seat,
            s?.name || '',
            s ? (activeVisit(state, s.id) ? 'Occupied' : 'Reserved') : 'Available',
          ]
        }),
      )
    notify('Report downloaded. Open the CSV file in Excel.')
  }
  return (
    <>
      <div className="stats-grid">
        <Stat value={money(m.collected)} label="Revenue" note={monthText(month)} />
        <Stat
          value={m.students.length}
          label="Members in Period"
          note="Joined by selected billing month"
          color="blue"
        />
        <Stat
          value={`${Math.round((m.occupied / m.totalSeats) * 100)}%`}
          label="Current Occupancy"
          note={`Live snapshot · all ${m.totalSeats} seats`}
          color="purple"
        />
        <Stat
          value={visits.length}
          label="Attendance Visits"
          note={`${distinct} distinct students this period`}
          color="amber"
        />
      </div>
      <div className="wide-columns">
        <Card title="Revenue Trend • Last 6 Months">
          <RevenueChart state={state} month={month} />
        </Card>
        <Card title="Membership Distribution">
          <p className="helper">Current active memberships</p>
          <div className="distribution">
            {distribution.map((p) => (
              <div key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {p.count} students •{' '}
                    {active.length ? Math.round((p.count / active.length) * 100) : 0}%
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={{ width: `${active.length ? (p.count / active.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="wide-columns">
        <Card title="Downloadable Reports">
          <div className="download-list">
            {[
              {
                id: 'fees',
                name: 'Monthly Fee Collection',
                detail: `${m.payments.length} receipts`,
              },
              {
                id: 'attendance',
                name: 'Student Attendance Register',
                detail: `${visits.length} visits`,
              },
              { id: 'dues', name: 'Pending Fee & Overdue', detail: `${m.pending.length} records` },
              { id: 'seats', name: 'Seat Occupancy Summary', detail: 'Current snapshot' },
              {
                id: 'students',
                name: 'Student Master Database',
                detail: `${state.students.length} students`,
              },
            ].map((r) => (
              <button key={r.id} onClick={() => exportReport(r.id)}>
                <strong>{r.name}</strong>
                <span>CSV / Excel</span>
                <span className="blue">
                  {r.detail}
                  <ArrowDownToLine size={13} />
                </span>
              </button>
            ))}
            <button onClick={() => window.print()}>
              <strong>Print Analytics Summary</strong>
              <span>PDF</span>
              <span className="blue">
                Print / Save PDF
                <Printer size={13} />
              </span>
            </button>
          </div>
        </Card>
        <Card title="Operational Insights">
          <div className="insights">
            <Detail label="Most popular plan">
              {distribution[0]?.name || '—'} · {distribution[0]?.count || 0} students
            </Detail>
            <Detail label="Most occupied row">
              {rows[0].occupied
                ? `Row ${rows[0].row} · ${rows[0].occupied} / ${state.settings.seatsPerRow}`
                : 'No occupied seats'}
            </Detail>
            <Detail label="Collection gap">{money(m.due)} pending</Detail>
            <Detail label="Students without a seat">
              {active.filter((s) => !s.seat).length} students
            </Detail>
            <Detail label="Payment methods">
              {[...new Set(m.payments.map((p) => p.mode))].join(', ') || 'No payments yet'}
            </Detail>
          </div>
        </Card>
      </div>
    </>
  )
}
