import { useState } from 'react'
import { Clock3 } from 'lucide-react'
import { Card, Stat, Empty } from '../components'
import { today, dateText, clockText, getSeats, activeVisit, localDay } from '../lib'
import { useNow } from '../useNow'
import type { PageProps } from './pageTypes'
import { activeStudents, getMetrics } from '../utils/libraryMetrics'
import { FeeBadge } from '../components/FeeBadge'
import { AttendanceButton } from '../components/AttendanceButton'
import { AttendanceRegister } from '../components/AttendanceRegister'
import { studyWindow, studentHours } from '../utils/availability'
import { AvailabilityCard } from '../components/AvailabilityCard'

export function SeatsAttendancePage({
  state,
  setModal,
  toggleAttendance,
}: PageProps & { toggleAttendance: (id: string) => Promise<void> }) {
  const now = useNow()
  const seats = getSeats(state.settings)
  const [selected, setSelected] = useState(seats[0]),
    [filter, setFilter] = useState('all')
  const m = getMetrics(state),
    active = activeStudents(state)
  const selectedStudent = active.find((s) => s.seat === selected)
  const selectedVisit = selectedStudent && activeVisit(state, selectedStudent.id)
  const visits = [...state.attendance]
    .filter((a) => localDay(a.checkIn) === today())
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
  const overdue = state.attendance.filter(
    (a) =>
      !a.checkOut &&
      (now - new Date(a.checkIn).getTime()) / 3600000 >
        (state.students.find((s) => s.id === a.studentId)
          ? studentHours(
              state,
              state.students.find((s) => s.id === a.studentId)!,
            )
          : 24) +
          state.settings.overtimeGraceMinutes / 60,
  )
  return (
    <>
      <div className="stats-grid">
        <Stat value={m.occupied} label="Occupied" note="Students currently checked in" />
        <Stat value={m.reserved} label="Reserved" note="Assigned, not checked in" color="amber" />
        <Stat value={m.available} label="Available" note="Unassigned seats" color="slate" />
        <Stat
          value={`${Math.round((m.occupied / m.totalSeats) * 100)}%`}
          label="Occupancy"
          note={`${m.totalSeats} seats · ${state.settings.floorName}`}
          color="blue"
        />
      </div>
      <AvailabilityCard state={state} />
      {overdue.length > 0 && (
        <div className="alert warning">
          <Clock3 size={16} />
          {overdue.length} students have exceeded their daily plan hours. Review their check-out
          times.
        </div>
      )}
      <div className="seat-layout">
        <Card
          title={`${state.settings.floorName} • ${m.totalSeats} Seats`}
          className="seat-map-card"
          extra={
            <select
              aria-label="Filter seats"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All seats</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
              <option value="available">Available</option>
            </select>
          }
        >
          <div className="seat-legend">
            <span>
              <i className="occupied" />
              Occupied
            </span>
            <span>
              <i className="reserved" />
              Reserved
            </span>
            <span>
              <i className="available" />
              Available
            </span>
          </div>
          <div className="seat-map-scroll">
            <div
              className="seat-map"
              style={{ minWidth: `${state.settings.seatsPerRow * 47 + 18}px` }}
            >
              {state.settings.seatRows.map((row) => (
                <div
                  className="seat-row"
                  key={row}
                  style={{
                    gridTemplateColumns: `10px repeat(${state.settings.seatsPerRow}, minmax(0, 1fr))`,
                  }}
                >
                  <span className="row-label">{row}</span>
                  {seats
                    .filter((seat) => seat.startsWith(row))
                    .map((seat) => {
                      const student = active.find((s) => s.seat === seat),
                        occupied = student && activeVisit(state, student.id),
                        status = occupied ? 'occupied' : student ? 'reserved' : 'available'
                      return (
                        <button
                          key={seat}
                          className={`seat ${status} ${selected === seat ? 'chosen' : ''} ${filter !== 'all' && filter !== status ? 'dimmed' : ''}`}
                          aria-label={`Seat ${seat}, ${status}${student ? `, ${student.name}` : ''}`}
                          aria-pressed={selected === seat}
                          onClick={() => setSelected(seat)}
                        >
                          <strong>{seat.slice(2)}</strong>
                          <small>{occupied ? 'In' : student ? 'Hold' : 'Free'}</small>
                        </button>
                      )
                    })}
                </div>
              ))}
            </div>
          </div>
          <div className="seat-map-footer">
            <span>Click a seat to view its student and attendance.</span>
            <span>
              Rows {state.settings.seatRows.join(', ')} · {state.settings.seatsPerRow} seats per row
            </span>
          </div>
        </Card>
        <Card title="Today's Attendance" className="attendance-card">
          <p className="helper">
            {visits.length} check-ins •{' '}
            {state.attendance.filter((a) => a.checkOut && localDay(a.checkOut) === today()).length}{' '}
            check-outs today
          </p>
          <div className="attendance-feed">
            {visits.slice(0, 6).map((a) => (
              <button className="attendance-event" key={a.id} onClick={() => setSelected(a.seat)}>
                <strong>
                  {clockText(a.checkIn)}&nbsp; {a.studentName}
                </strong>
                <span className={a.checkOut ? 'slate' : 'green'}>
                  {a.seat} • {a.checkOut ? `OUT ${clockText(a.checkOut)}` : 'IN'}
                </span>
              </button>
            ))}
            {!visits.length && <Empty>No check-ins today.</Empty>}
          </div>
          <div className="selected-seat">
            <h3>Seat {selected} Selected</h3>
            {selectedStudent ? (
              <>
                <p>
                  {selectedStudent.name} •{' '}
                  {state.plans.find((p) => p.id === selectedStudent.planId)?.name}
                </p>
                <p>
                  {selectedVisit
                    ? `Check-in ${clockText(selectedVisit.checkIn)}`
                    : 'Seat reserved · student not checked in'}
                </p>
                <p>Paid through {dateText(selectedStudent.validUntil)}</p>
                <p>Study window: {studyWindow(state, selectedStudent)}</p>
                <p>
                  Fee status: <FeeBadge state={state} student={selectedStudent} />
                </p>
                <div className="profile-actions">
                  <AttendanceButton
                    id={selectedStudent.id}
                    inLibrary={!!selectedVisit}
                    toggle={toggleAttendance}
                  />
                  <button
                    className="button primary small"
                    onClick={() => setModal({ type: 'student', student: selectedStudent })}
                  >
                    Edit student
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>This seat is available.</p>
                <p>Assign it when adding or editing a student.</p>
                <button
                  className="button primary small"
                  onClick={() => setModal({ type: 'student', seat: selected })}
                >
                  Add student
                </button>
              </>
            )}
          </div>
        </Card>
      </div>
      <AttendanceRegister state={state} setModal={setModal} />
    </>
  )
}
