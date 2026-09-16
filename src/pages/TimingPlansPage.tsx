import { Check } from 'lucide-react'
import { Card } from '../components'
import { money, timeText } from '../lib'
import type { PageProps } from './pageTypes'
import { OperatingHoursEditor } from '../components/OperatingHoursEditor'
import { AvailabilityCard } from '../components/AvailabilityCard'
import { studyWindow, studentHours, minutes } from '../utils/availability'
import { activeStudents } from '../utils/libraryMetrics'

export function TimingPlansPage({
  state,
  setModal,
  mutate,
}: PageProps & { mutate: (action: unknown, message: string) => Promise<void> }) {
  const active = activeStudents(state)
  const slots = state.settings.timeSlots
  return (
    <>
      <OperatingHoursEditor state={state} mutate={mutate} />
      <AvailabilityCard state={state} />
      <Card title="Student Study Hours">
        <p className="helper">
          Daily hours default to the membership plan. Edit a student to choose their start time and
          a shorter study duration. Slots outside opening hours need review.
        </p>
        <div className="table-wrap study-hours-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Seat</th>
                <th>Study window (IST)</th>
                <th>Hours / day</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.map((student) => (
                <tr key={student.id}>
                  <td>
                    <strong>{student.name}</strong>
                  </td>
                  <td>{student.seat || 'Unassigned'}</td>
                  <td>
                    {studyWindow(state, student)}
                    {(state.settings.weekdayClosed ||
                      state.settings.sundayClosed ||
                      student.startTime < state.settings.weekdayOpen ||
                      student.startTime < state.settings.sundayOpen ||
                      minutes(student.startTime) + studentHours(state, student) * 60 >
                        minutes(state.settings.weekdayClose) ||
                      minutes(student.startTime) + studentHours(state, student) * 60 >
                        minutes(state.settings.sundayClose)) && (
                      <small className="block-helper amber">Review against opening hours</small>
                    )}
                  </td>
                  <td>{studentHours(state, student)}</td>
                  <td>
                    <button
                      className="text-button"
                      aria-label={'Edit study hours for ' + student.name}
                      onClick={() => setModal({ type: 'student', student })}
                    >
                      Edit hours
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <h2 className="section-title">Membership Plans</h2>
      <div className="plans-grid">
        {state.plans.map((p) => (
          <Card className="plan-card" key={p.id}>
            <h2 className="blue">
              {p.name}
              {p.archived ? ' (archived)' : ''}
            </h2>
            <div className="plan-price">
              {money(p.fee)} <span>/ month</span>
            </div>
            <p className="muted">{p.description}</p>
            <p>{p.hours} continuous hours daily</p>
            <p className="purple">{active.filter((s) => s.planId === p.id).length} students</p>
            {state.role === 'owner' && (
              <div className="profile-actions">
                <button
                  className="button secondary small"
                  onClick={() => setModal({ type: 'plan', plan: p })}
                >
                  Edit Plan
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    setModal({ type: p.archived ? 'planRestore' : 'planArchive', plan: p })
                  }
                >
                  {p.archived ? 'Restore' : 'Archive'}
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="two-columns">
        <Card title="Suggested Time Slots" className="timing-card">
          {slots.map((slot) => (
            <div className="slot-row" key={slot.name}>
              <strong>{slot.name}</strong>
              <span>
                {timeText(slot.start)} – {timeText(slot.end)}
              </span>
              <span className="green">
                {active.filter((s) => s.startTime === slot.start).length} starts
              </span>
            </div>
          ))}
          <p className="helper">
            Starts counts members whose selected start time matches the slot. Each membership has
            its own daily duration.
          </p>
        </Card>
        <Card title="Plan & Timing Rules" className="timing-card">
          <ul className="rules-list">
            {[
              'Monthly billing · full monthly fee',
              'One assigned seat per student',
              'Staff records check-in and check-out',
              `Overtime alert after allotted hours + ${state.settings.overtimeGraceMinutes} minute grace`,
              'Seat is released when membership is archived',
              'Existing prices retained until plan changes',
            ].map((rule) => (
              <li key={rule}>
                <Check size={13} />
                {rule}
              </li>
            ))}
          </ul>
          <p className="helper">
            Opening hours are displayed for staff guidance; attendance is recorded manually.
          </p>
        </Card>
      </div>
    </>
  )
}
