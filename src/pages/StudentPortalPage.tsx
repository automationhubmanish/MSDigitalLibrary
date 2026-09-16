import { useState } from 'react'
import { LibraryLogo } from '../components/LibraryLogo'
import { Card, Detail, Empty } from '../components'
import { api, dateText, clockText, money, timeText, isPaid } from '../lib'
import { studyWindow, studentHours } from '../utils/availability'
import type { LibraryState } from '../types'

export function StudentPortalPage({
  state,
  refresh,
}: {
  state: LibraryState
  refresh: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const student = state.students[0]
  return (
    <main className="student-portal">
      <header className="portal-header">
        <LibraryLogo />
        <div>
          <strong>{state.settings.name}</strong>
          <p>Welcome, {state.account?.name}</p>
        </div>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await api('/api/logout', {})
              await refresh()
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        >
          Sign out
        </button>
      </header>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {state.role === 'pending' ? (
        <Card title="Your account is ready">
          <p>
            User ID: <strong>{state.account?.userId}</strong>
          </p>
          <p>
            Your library access is awaiting activation. Contact the owner to link your student
            membership or approve staff access.
          </p>
          <button className="button primary" onClick={() => void refresh()}>
            Check access status
          </button>
        </Card>
      ) : (
        <>
          <h1>My Library Membership</h1>
          {student ? (
            <div className="two-columns">
              <Card title={student.name}>
                <Detail label="Student ID">{student.id}</Detail>
                <Detail label="Seat">{student.seat || 'Unassigned'}</Detail>
                <Detail label="Membership">{student.archivedAt ? 'Archived' : 'Active'}</Detail>
                <Detail label="Monthly fee">{money(student.monthlyFee)}</Detail>
                <Detail label="This month">
                  {isPaid(state, student) ? 'Paid' : 'Payment due'}
                </Detail>
                <Detail label="Paid through">{dateText(student.validUntil)}</Detail>
                <Detail label="Study window">{studyWindow(state, student)}</Detail>
                <Detail label="Daily hours">{studentHours(state, student)} hours</Detail>
              </Card>
              <Card title="Library Opening Hours">
                <Detail label="Monday–Saturday">
                  {state.settings.weekdayClosed
                    ? 'Closed'
                    : `${timeText(state.settings.weekdayOpen)} – ${timeText(state.settings.weekdayClose)}`}
                </Detail>
                <Detail label="Sunday">
                  {state.settings.sundayClosed
                    ? 'Closed'
                    : `${timeText(state.settings.sundayOpen)} – ${timeText(state.settings.sundayClose)}`}
                </Detail>
                <p className="helper">
                  All times are India Standard Time. Contact the library to pay fees or update
                  membership details.
                </p>
              </Card>
            </div>
          ) : (
            <Card>
              <Empty>Your membership is not linked. Contact the library owner.</Empty>
            </Card>
          )}
          <Card title="My Payments">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Month</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {state.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.id}</td>
                      <td>{payment.month}</td>
                      <td>{money(payment.amount)}</td>
                      <td>{dateText(payment.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!state.payments.length && <Empty>No payments recorded yet.</Empty>}
            </div>
          </Card>
          <Card title="My Attendance">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Seat</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.attendance]
                    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
                    .slice(0, 50)
                    .map((visit) => (
                      <tr key={visit.id}>
                        <td>{dateText(visit.checkIn)}</td>
                        <td>{visit.seat}</td>
                        <td>{clockText(visit.checkIn)}</td>
                        <td>{visit.checkOut ? clockText(visit.checkOut) : 'In library'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!state.attendance.length && <Empty>No attendance recorded yet.</Empty>}
            </div>
            <p className="helper">Latest 50 visits.</p>
          </Card>
        </>
      )}
    </main>
  )
}
