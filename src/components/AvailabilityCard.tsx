import { useState } from 'react'
import { Card } from '../components'
import { today, timeText, getSeats } from '../lib'
import type { LibraryState } from '../types'
import { minutes, openingWindow, studentHours } from '../utils/availability'

export function AvailabilityCard({ state }: { state: LibraryState }) {
  const [day, setDay] = useState(today())
  const [at, setAt] = useState('10:00')
  const hours = openingWindow(state, day)
  const open = !hours.closed && at >= hours.start && at < hours.end
  const scheduled = state.students.filter(
    (s) =>
      !s.archivedAt &&
      s.joined <= day &&
      minutes(s.startTime) <= minutes(at) &&
      minutes(s.startTime) + studentHours(state, s) * 60 > minutes(at),
  )
  const assigned = state.students.filter((s) => !s.archivedAt && s.seat).length
  return (
    <Card
      title="Library Availability"
      extra={
        <a className="text-button" href="#plans">
          Manage hours
        </a>
      }
    >
      <div className="availability-controls">
        <label>
          Availability date
          <input
            type="date"
            value={day}
            required
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value)
            }}
          />
        </label>
        <label>
          Availability time (IST)
          <input
            type="time"
            value={at}
            required
            onChange={(e) => {
              if (e.target.value) setAt(e.target.value)
            }}
          />
        </label>
        <div>
          <strong className={open ? 'green' : 'amber'}>
            {open ? 'Open at selected time' : 'Closed at selected time'}
          </strong>
          <p className="helper">
            {hours.closed
              ? 'Closed for this day'
              : `${timeText(hours.start)} – ${timeText(hours.end)}`}
          </p>
        </div>
        <div>
          <strong>{open ? scheduled.length : 0} students scheduled</strong>
          <p className="helper">
            {open ? getSeats(state.settings).length - assigned : 0} unassigned seats available
          </p>
        </div>
      </div>
      <p className="helper">
        Based on saved study windows. Assigned seats stay reserved outside a student’s study hours;
        view actual attendance on Seats & Attendance.
      </p>
    </Card>
  )
}
