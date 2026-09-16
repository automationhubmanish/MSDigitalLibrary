import { useState } from 'react'
import type { LibraryState } from '../types'
import { Card } from '../components'
import { timeText } from '../lib'

export function OperatingHoursEditor({
  state,
  mutate,
}: {
  state: LibraryState
  mutate: (action: unknown, message: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Card
      title="Library Operating Hours"
      extra={
        state.role === 'owner' && !editing ? (
          <button className="button secondary small" onClick={() => setEditing(true)}>
            Edit opening hours
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const values = new FormData(e.currentTarget)
            setBusy(true)
            setError('')
            try {
              await mutate(
                {
                  type: 'settings.save',
                  settings: {
                    ...state.settings,
                    weekdayOpen: values.get('weekdayOpen'),
                    weekdayClose: values.get('weekdayClose'),
                    sundayOpen: values.get('sundayOpen'),
                    sundayClose: values.get('sundayClose'),
                    weekdayClosed: values.has('weekdayClosed'),
                    sundayClosed: values.has('sundayClosed'),
                  },
                },
                'Library opening hours saved.',
              )
              setEditing(false)
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="two-columns">
              {(['weekday', 'sunday'] as const).map((day) => (
                <div key={day}>
                  <h3>{day === 'weekday' ? 'Monday–Saturday' : 'Sunday'}</h3>
                  <label className="checkbox-label">
                    <input
                      name={`${day}Closed`}
                      type="checkbox"
                      defaultChecked={!!state.settings[`${day}Closed`]}
                    />
                    {day === 'weekday' ? 'Closed Monday–Saturday' : 'Closed on Sunday'}
                  </label>
                  <div className="form-grid">
                    <label>
                      {day === 'weekday' ? 'Opening time' : 'Sunday opening'}
                      <input
                        name={`${day}Open`}
                        type="time"
                        required
                        defaultValue={state.settings[`${day}Open`]}
                      />
                    </label>
                    <label>
                      {day === 'weekday' ? 'Closing time' : 'Sunday closing'}
                      <input
                        name={`${day}Close`}
                        type="time"
                        required
                        defaultValue={state.settings[`${day}Close`]}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="button primary">{busy ? 'Saving…' : 'Save opening hours'}</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="availability-controls">
          <div>
            <strong>Monday–Saturday</strong>
            <p>
              {state.settings.weekdayClosed
                ? 'Closed'
                : `${timeText(state.settings.weekdayOpen)} – ${timeText(state.settings.weekdayClose)}`}
            </p>
          </div>
          <div>
            <strong>Sunday</strong>
            <p>
              {state.settings.sundayClosed
                ? 'Closed'
                : `${timeText(state.settings.sundayOpen)} – ${timeText(state.settings.sundayClose)}`}
            </p>
          </div>
          <p className="helper">All times in India Standard Time.</p>
        </div>
      )}
    </Card>
  )
}
