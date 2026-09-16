import { LibrarySettingsForm } from '../components/LibrarySettingsForm'
import { getSeats, dateText, clockText } from '../lib'
import { ArrowDownToLine, ShieldCheck, Database, Users } from 'lucide-react'
import type { LibraryState } from '../types'
import { Card } from '../components'
import { AccountManagement } from '../components/AccountManagement'

export function SettingsPage({
  state,
  mutate,
}: {
  state: LibraryState
  mutate: (action: unknown, message: string) => Promise<void>
}) {
  return (
    <div className="two-columns settings-columns">
      <Card title="Library Details">
        <p className="helper">Library times are shown in India Standard Time.</p>
        <LibrarySettingsForm state={state} mutate={mutate} />
      </Card>
      <div className="stack">
        {state.role === 'owner' && <AccountManagement state={state} />}
        {state.layoutNotice && (
          <Card title="Seat layout update">
            <p className="helper">{state.layoutNotice.message}</p>
            <ul>
              {state.layoutNotice.released.map((s) => (
                <li key={s.studentId}>
                  {s.name} · previously {s.oldSeat}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Recent Changes">
          <div className="audit-list">
            {state.audit.slice(0, 25).map((entry) => (
              <div key={entry.id}>
                <strong>{entry.type}</strong>
                <p className="helper">
                  {dateText(entry.date)} {clockText(entry.date)} · {entry.role}
                  {entry.recordId ? ` · ${entry.recordId}` : ''}
                </p>
                {entry.reason && <p>{entry.reason}</p>}
              </div>
            ))}
            {!state.audit.length && <p className="helper">Changes will appear here.</p>}
          </div>
        </Card>
        <Card title="Workspace">
          <div className="settings-feature">
            <ShieldCheck size={23} />
            <div>
              <h3>{state.role === 'owner' ? 'Owner access' : 'Staff access'}</h3>
              <p>Your session expires after 12 hours.</p>
            </div>
          </div>
          <div className="settings-feature">
            <Database size={23} />
            <div>
              <h3>{state.demo ? 'Demo database' : 'Shared library database'}</h3>
              <p>
                {state.demo
                  ? 'Sample records are stored separately from your future production library.'
                  : 'Records are saved on the server and shared across signed-in devices.'}
              </p>
            </div>
          </div>
          <div className="settings-feature">
            <Users size={23} />
            <div>
              <h3>
                {getSeats(state.settings).length} seats · {state.settings.floorName}
              </h3>
              <p>
                Rows {state.settings.seatRows.join(', ')} · {state.settings.seatsPerRow} seats per
                row.
              </p>
            </div>
          </div>
        </Card>
        <Card title="Backups & Access">
          <p className="helper">
            Download a complete data snapshot for safekeeping. It includes student contacts, fee
            records, and attendance.
          </p>
          {state.role === 'owner' && (
            <a className="button secondary" href="/api/backup" download>
              <ArrowDownToLine size={15} />
              Download data backup
            </a>
          )}
          <p className="helper">
            Owner and staff credentials are configured on the server. Deployment and backup
            instructions are included in the project README.
          </p>
        </Card>
      </div>
    </div>
  )
}
