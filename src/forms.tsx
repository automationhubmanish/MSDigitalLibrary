import { useState } from 'react'
import type { LibraryState, Modal } from './types'
import { ModalShell } from './components'
import { money, getSeats, today, monthText, reminderMessage } from './lib'
import { RecordCorrectionModal } from './components/RecordCorrectionModal'
import { endTime } from './utils/availability'
import { timeText } from './lib'
type Correction = Extract<
  Modal,
  {
    type:
      | 'paymentEdit'
      | 'paymentVoid'
      | 'paymentRestore'
      | 'attendanceEdit'
      | 'studentRestore'
      | 'planArchive'
      | 'planRestore'
  }
>
type BasicModal = Exclude<Modal, Correction>
interface FormProps {
  modal: Modal
  state: LibraryState
  onClose: () => void
  mutate: (action: unknown, message: string) => Promise<void>
}
export function RecordModal(props: FormProps) {
  const { modal } = props
  switch (modal.type) {
    case 'paymentEdit':
    case 'paymentVoid':
    case 'paymentRestore':
    case 'attendanceEdit':
    case 'studentRestore':
    case 'planArchive':
    case 'planRestore':
      return <RecordCorrectionModal {...props} modal={modal} />
    default:
      return <BasicRecordModal {...props} modal={modal} />
  }
}

function BasicRecordModal({
  modal,
  state,
  onClose,
  mutate,
}: {
  modal: BasicModal
  state: LibraryState
  onClose: () => void
  mutate: (action: unknown, message: string) => Promise<void>
}) {
  const seats = getSeats(state.settings)
  const [startTime, setStartTime] = useState(
    modal.type === 'student' ? modal.student?.startTime || '08:00' : '08:00',
  )
  const [dailyHours, setDailyHours] = useState<number | ''>(
    modal.type === 'student' ? (modal.student?.dailyHours ?? '') : '',
  )
  const [monthlyFee, setMonthlyFee] = useState(
    modal.type === 'student' && modal.student
      ? modal.student.monthlyFee
      : state.plans.find((p) => !p.archived)?.fee || 0,
  )
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [studentId, setStudentId] = useState(
    'student' in modal && modal.student
      ? modal.student.id
      : state.students.find((s) => !s.archivedAt)?.id || '',
  )
  const [planId, setPlanId] = useState(
    modal.type === 'student'
      ? modal.student?.planId || state.plans.find((p) => !p.archived)?.id
      : '',
  )
  const [billingMonth, setBillingMonth] = useState(
    modal.type === 'payment' && modal.month ? modal.month : today().slice(0, 7),
  )
  const selected = state.students.find((s) => s.id === studentId)
  const duplicate = state.payments.some(
    (p) => p.studentId === studentId && p.month === billingMonth && !p.voided,
  )
  const save = async (action: unknown, message: string) => {
    setBusy(true)
    setError('')
    try {
      await mutate(action, message)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const actions = (label: string, disabled = false) => (
    <div className="form-actions">
      <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className="button primary" disabled={busy || disabled}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )
  const errorMessage = error && (
    <p className="alert error" role="alert">
      {error}
    </p>
  )
  if (modal.type === 'student') {
    const s = modal.student
    return (
      <ModalShell title={s ? 'Edit student' : 'Add new student'} onClose={onClose}>
        <p className="modal-description">Keep membership, contact, and seat details together.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            void save(
              {
                type: 'student.save',
                id: s?.id,
                student: {
                  name: f.get('name'),
                  phone: f.get('phone'),
                  planId,
                  seat: f.get('seat'),
                  startTime,
                  dailyHours: dailyHours === '' ? null : dailyHours,
                  joined: f.get('joined'),
                  notes: f.get('notes'),
                  ...(state.role === 'owner' ? { monthlyFee } : {}),
                },
              },
              s
                ? 'Student details updated.'
                : 'Student added. You can now collect their first fee.',
            )
          }}
        >
          <div className="form-grid">
            <label>
              Full name
              <input
                name="name"
                defaultValue={s?.name}
                required
                minLength={2}
                maxLength={80}
                placeholder="Student’s full name"
                autoFocus
              />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                defaultValue={s?.phone}
                required
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                placeholder="10-digit mobile number"
              />
            </label>
            <label>
              Membership plan
              <select
                name="planId"
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value)
                  setDailyHours('')
                  setMonthlyFee(state.plans.find((p) => p.id === e.target.value)?.fee || 0)
                }}
                required
              >
                {state.plans
                  .filter((p) => !p.archived || p.id === s?.planId)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {money(p.fee)}/month
                    </option>
                  ))}
              </select>
            </label>
            {state.role === 'owner' && (
              <label>
                Agreed monthly fee (₹)
                <input
                  type="number"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(Number(e.target.value))}
                  min={0}
                  max={100000}
                  required
                />
              </label>
            )}
            <label>
              Assigned seat
              <select name="seat" defaultValue={s?.seat || modal.seat || ''}>
                <option value="">Unassigned</option>
                {seats.map((seat) => (
                  <option
                    key={seat}
                    disabled={state.students.some(
                      (other) => !other.archivedAt && other.id !== s?.id && other.seat === seat,
                    )}
                  >
                    {seat}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Daily start time
              <input
                type="time"
                name="startTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label>
              Daily study hours
              <input
                type="number"
                value={dailyHours}
                min={0.5}
                step={0.5}
                max={state.plans.find((p) => p.id === planId)?.hours || 24}
                placeholder={`Use plan: ${state.plans.find((p) => p.id === planId)?.hours || 0} hours`}
                onChange={(e) => setDailyHours(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <label>
              Joining date
              <input
                name="joined"
                type="date"
                defaultValue={s?.joined || today()}
                max={today()}
                required
              />
            </label>
          </div>
          <p className="info-strip">
            Study window: {timeText(startTime)} –{' '}
            {timeText(
              endTime(
                startTime,
                dailyHours === ''
                  ? state.plans.find((p) => p.id === planId)?.hours || 0
                  : dailyHours,
              ),
            )}
            . Leave daily hours blank to follow the plan. All times are IST.
          </p>
          <label>
            Notes <span className="muted">(optional)</span>
            <textarea
              name="notes"
              defaultValue={s?.notes}
              maxLength={1000}
              placeholder="Study goals, preferences, or other details"
              rows={3}
            />
          </label>
          <p className="helper">
            One assigned seat per student. Existing members keep their agreed monthly fee unless
            their plan changes.
          </p>
          {errorMessage}
          {actions(s ? 'Save changes' : 'Add student')}
        </form>
      </ModalShell>
    )
  }
  if (modal.type === 'payment')
    return (
      <ModalShell title="Collect membership fee" onClose={onClose}>
        <p className="modal-description">
          Record a payment already received. This does not charge the student.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            void save(
              {
                type: 'payment.collect',
                id: studentId,
                month: billingMonth,
                mode: f.get('mode'),
                reference: f.get('reference'),
              },
              'Payment recorded and receipt saved.',
            )
          }}
        >
          <label>
            Student
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              {state.students
                .filter((s) => !s.archivedAt)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name} · {s.id}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Billing month
              <input
                type="month"
                value={billingMonth}
                min={selected?.joined.slice(0, 7)}
                onChange={(e) => setBillingMonth(e.target.value)}
                required
              />
            </label>
            <label>
              Payment method
              <select name="mode">
                {state.settings.paymentMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Payment reference <span className="muted">(optional)</span>
            <input name="reference" maxLength={100} placeholder="UPI reference or a short note" />
          </label>
          <div className="payment-summary">
            <span>Monthly fee to record</span>
            <strong>{money(selected?.monthlyFee || 0)}</strong>
          </div>
          {duplicate && (
            <p className="alert warning">
              This student has already paid for {monthText(billingMonth)}. Choose another month.
            </p>
          )}
          {!selected && <p className="helper">Add a student before collecting fees.</p>}
          {errorMessage}
          {actions('Record payment', !selected || duplicate)}
        </form>
      </ModalShell>
    )
  if (modal.type === 'plan')
    return (
      <ModalShell
        title={modal.plan ? 'Edit membership plan' : 'Add membership plan'}
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            void save(
              {
                type: 'plan.save',
                id: modal.plan?.id,
                applyPriceToMembers: f.get('applyPriceToMembers') === 'on',
                plan: {
                  name: f.get('name'),
                  hours: Number(f.get('hours')),
                  fee: Number(f.get('fee')),
                  description: f.get('description'),
                },
              },
              'Membership plan saved.',
            )
          }}
        >
          <label>
            Plan name
            <input
              name="name"
              defaultValue={modal.plan?.name}
              required
              minLength={2}
              maxLength={50}
              placeholder="6 Hours"
            />
          </label>
          <div className="form-grid">
            <label>
              Hours per day
              <input
                name="hours"
                type="number"
                defaultValue={modal.plan?.hours || 6}
                min={1}
                max={24}
                required
              />
            </label>
            <label>
              Monthly fee (₹)
              <input
                name="fee"
                type="number"
                defaultValue={modal.plan?.fee || 400}
                min={1}
                max={100000}
                required
              />
            </label>
          </div>
          <label>
            Description
            <input
              name="description"
              defaultValue={modal.plan?.description || ''}
              maxLength={100}
              placeholder="Morning / Evening"
            />
          </label>
          <p className="helper">
            New prices apply to new memberships and plan changes. Existing students retain their
            agreed price unless you choose to update them below.
          </p>
          {errorMessage}
          {modal.plan && (
            <label className="checkbox-label">
              <input type="checkbox" name="applyPriceToMembers" />
              Apply this fee to all active students on this plan. Existing receipts remain
              unchanged.
            </label>
          )}
          {actions('Save plan')}
        </form>
      </ModalShell>
    )
  if (modal.type === 'archive')
    return (
      <ModalShell title="Archive student?" onClose={onClose}>
        <p className="modal-description">
          {modal.student.name} will be checked out and their seat released. Their payment and
          attendance history will be retained.
        </p>
        {errorMessage}
        <div className="form-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() =>
              void save(
                { type: 'student.archive', id: modal.student.id },
                'Student archived. Historical records retained.',
              )
            }
          >
            {busy ? 'Saving…' : 'Archive student'}
          </button>
        </div>
      </ModalShell>
    )
  return (
    <ModalShell title="Reminder preview" onClose={onClose}>
      <div className="message-preview">
        <strong>{state.settings.name}</strong>
        <p>{reminderMessage(state, modal.student)}</p>
      </div>
      <p className="helper">
        Preview only. No message has been sent. Use Notifications to send or simulate a reminder.
      </p>
      <div className="form-actions">
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </ModalShell>
  )
}
