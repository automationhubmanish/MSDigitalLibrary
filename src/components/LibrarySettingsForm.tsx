import { useState } from 'react'
import type { LibraryState, Settings } from '../types'
import { getSeats } from '../lib'

export function LibrarySettingsForm({
  state,
  mutate,
}: {
  state: LibraryState
  mutate: (action: unknown, message: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<Settings>(() => structuredClone(state.settings))
  const [rowsText, setRowsText] = useState(state.settings.seatRows.join(', '))
  const [methodsText, setMethodsText] = useState(state.settings.paymentMethods.join(', '))
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [release, setRelease] = useState(false)
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))
  const rows = rowsText
    .split(',')
    .map((row) => row.trim().toUpperCase())
    .filter(Boolean)
  const nextSeats = getSeats({ ...draft, seatRows: rows })
  const affected = state.students.filter(
    (student) => student.seat && !nextSeats.includes(student.seat),
  )
  const timeInput = (
    label: string,
    key: 'weekdayOpen' | 'weekdayClose' | 'sundayOpen' | 'sundayClose' | 'reminderTime',
  ) => (
    <label>
      {label}
      <input
        name={key}
        type="time"
        value={draft[key]}
        onChange={(e) => update(key, e.target.value)}
        required
      />
    </label>
  )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
          await mutate(
            {
              type: 'settings.save',
              releaseRemovedSeats: release,
              settings: {
                ...draft,
                seatRows: rows,
                paymentMethods: methodsText
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            },
            'Configuration saved across all pages.',
          )
          setRelease(false)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <fieldset disabled={state.role !== 'owner' || busy}>
        <label>
          Library name
          <input
            name="name"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </label>
        <h3>Seat layout</h3>
        <label>
          Floor / room name
          <input
            value={draft.floorName}
            onChange={(e) => update('floorName', e.target.value)}
            maxLength={50}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Seat rows (comma separated)
            <input
              value={rowsText}
              onChange={(e) => setRowsText(e.target.value)}
              placeholder="A, B, C, D, E, F"
              required
            />
          </label>
          <label>
            Seats per row
            <input
              type="number"
              value={draft.seatsPerRow}
              min={1}
              max={30}
              onChange={(e) => update('seatsPerRow', Number(e.target.value))}
              required
            />
          </label>
        </div>
        <div className="info-strip">
          {rows.length} rows × {draft.seatsPerRow} seats = {nextSeats.length} total seats
        </div>
        {affected.length > 0 && (
          <div className="layout-warning">
            <p>{affected.length} students are assigned to seats being removed:</p>
            <ul>
              {affected.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.seat}
                </li>
              ))}
            </ul>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={release}
                onChange={(e) => setRelease(e.target.checked)}
                required
              />
              Unassign these students and close affected open visits. Keep all historical records.
            </label>
          </div>
        )}
        <h3>Monday–Saturday</h3>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!draft.weekdayClosed}
            onChange={(e) => update('weekdayClosed', e.target.checked)}
          />
          Closed Monday–Saturday
        </label>
        <div className="form-grid">
          {timeInput('Opening time', 'weekdayOpen')}
          {timeInput('Closing time', 'weekdayClose')}
        </div>
        <h3>Sunday</h3>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!draft.sundayClosed}
            onChange={(e) => update('sundayClosed', e.target.checked)}
          />
          Closed on Sunday
        </label>
        <div className="form-grid">
          {timeInput('Sunday opening', 'sundayOpen')}
          {timeInput('Sunday closing', 'sundayClose')}
        </div>
        <label>
          Overtime grace period (minutes)
          <input
            type="number"
            value={draft.overtimeGraceMinutes}
            min={0}
            max={120}
            onChange={(e) => update('overtimeGraceMinutes', Number(e.target.value))}
            required
          />
        </label>
        <h3>Suggested time slots</h3>
        {draft.timeSlots.map((slot, i) => (
          <div className="slot-editor" key={i}>
            <label>
              Slot {i + 1} name
              <input
                value={slot.name}
                onChange={(e) =>
                  update(
                    'timeSlots',
                    draft.timeSlots.map((s, index) =>
                      index === i ? { ...s, name: e.target.value } : s,
                    ),
                  )
                }
                required
                maxLength={50}
              />
            </label>
            <label>
              Start
              <input
                type="time"
                value={slot.start}
                onChange={(e) =>
                  update(
                    'timeSlots',
                    draft.timeSlots.map((s, index) =>
                      index === i ? { ...s, start: e.target.value } : s,
                    ),
                  )
                }
                required
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={slot.end}
                onChange={(e) =>
                  update(
                    'timeSlots',
                    draft.timeSlots.map((s, index) =>
                      index === i ? { ...s, end: e.target.value } : s,
                    ),
                  )
                }
                required
              />
            </label>
            <button
              type="button"
              className="text-button"
              aria-label={`Remove slot ${i + 1}`}
              onClick={() =>
                update(
                  'timeSlots',
                  draft.timeSlots.filter((_, index) => index !== i),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={draft.timeSlots.length >= 12}
          onClick={() =>
            update('timeSlots', [
              ...draft.timeSlots,
              { name: 'New slot', start: '08:00', end: '14:00' },
            ])
          }
        >
          Add time slot
        </button>
        <h3>Payments & reminders</h3>
        <label>
          Payment methods (comma separated)
          <input value={methodsText} onChange={(e) => setMethodsText(e.target.value)} required />
        </label>
        {timeInput('Preferred reminder time', 'reminderTime')}
        <label>
          Reminder message template
          <textarea
            value={draft.reminderTemplate}
            onChange={(e) => update('reminderTemplate', e.target.value)}
            minLength={10}
            maxLength={2000}
            rows={5}
            required
          />
        </label>
        <p className="helper">
          Available placeholders: {'{name}, {plan}, {amount}, {month}, {library}, {seat}'}. This
          changes fee reminders. Use Notifications to send or simulate them.
        </p>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </fieldset>
      {state.role !== 'owner' && <p className="helper">Only the owner can change configuration.</p>}
    </form>
  )
}
