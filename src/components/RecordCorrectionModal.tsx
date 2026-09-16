import { useState } from 'react'
import type { LibraryState, Modal } from '../types'
import { ModalShell } from '../components'
import { getSeats, today } from '../lib'

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
const inputDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 23)
const fromInput = (value: FormDataEntryValue | null) =>
  value ? new Date(`${value}+05:30`).toISOString() : null
export function RecordCorrectionModal({
  modal,
  state,
  onClose,
  mutate,
}: {
  modal: Correction
  state: LibraryState
  onClose: () => void
  mutate: (action: unknown, message: string) => Promise<void>
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const titles = {
    paymentEdit: 'Edit payment',
    paymentVoid: 'Void receipt',
    paymentRestore: 'Restore receipt',
    attendanceEdit: 'Correct attendance',
    studentRestore: 'Restore membership',
    planArchive: 'Archive plan',
    planRestore: 'Restore plan',
  }
  const save = async (action: unknown) => {
    setError('')
    setBusy(true)
    try {
      await mutate(action, 'Record updated. Correction history retained.')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const payment = 'payment' in modal ? modal.payment : null
  const visit = modal.type === 'attendanceEdit' ? modal.attendance : null
  const needsReason = modal.type.startsWith('payment') || modal.type === 'attendanceEdit'
  const seats = getSeats(state.settings)
  if (visit && !seats.includes(visit.seat)) seats.push(visit.seat)
  return (
    <ModalShell title={titles[modal.type]} onClose={onClose}>
      <p className="modal-description">
        Owner corrections are saved with an audit trail. Existing records are retained.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          if (modal.type === 'paymentEdit')
            void save({
              type: 'payment.save',
              id: modal.payment.id,
              reason: f.get('reason'),
              payment: {
                studentId: f.get('studentId'),
                amount: Number(f.get('amount')),
                month: f.get('month'),
                mode: f.get('mode'),
                reference: f.get('reference'),
                date: fromInput(f.get('date')),
              },
            })
          if (modal.type === 'paymentVoid' || modal.type === 'paymentRestore')
            void save({
              type: modal.type === 'paymentVoid' ? 'payment.void' : 'payment.restore',
              id: modal.payment.id,
              reason: f.get('reason'),
            })
          if (modal.type === 'attendanceEdit')
            void save({
              type: 'attendance.save',
              id: modal.attendance?.id,
              reason: f.get('reason'),
              attendance: {
                studentId: f.get('studentId'),
                seat: f.get('seat'),
                checkIn: fromInput(f.get('checkIn')),
                checkOut: fromInput(f.get('checkOut')),
                note: f.get('note'),
              },
            })
          if (modal.type === 'studentRestore')
            void save({ type: 'student.restore', id: modal.student.id })
          if (modal.type === 'planArchive' || modal.type === 'planRestore')
            void save({
              type: modal.type === 'planArchive' ? 'plan.archive' : 'plan.restore',
              id: modal.plan.id,
            })
        }}
      >
        {(modal.type === 'paymentEdit' || modal.type === 'attendanceEdit') && (
          <label>
            Student
            <select
              name="studentId"
              defaultValue={payment?.studentId || visit?.studentId || state.students[0]?.id}
              required
            >
              {state.students.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} · {s.id}
                  {s.archivedAt ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {modal.type === 'paymentEdit' && payment && (
          <>
            <div className="form-grid">
              <label>
                Amount received (₹)
                <input
                  name="amount"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={payment.amount}
                  required
                />
              </label>
              <label>
                Billing month
                <input name="month" type="month" defaultValue={payment.month} required />
              </label>
              <label>
                Payment method
                <select name="mode" defaultValue={payment.mode}>
                  {[...new Set([...state.settings.paymentMethods, payment.mode])].map((mode) => (
                    <option key={mode}>{mode}</option>
                  ))}
                </select>
              </label>
              <label>
                Payment date (IST)
                <input
                  name="date"
                  type="datetime-local"
                  step="0.001"
                  defaultValue={inputDate(payment.date)}
                  max={`${today()}T23:59`}
                  required
                />
              </label>
            </div>
            <label>
              Reference
              <input name="reference" defaultValue={payment.reference} maxLength={100} />
            </label>
          </>
        )}
        {modal.type === 'attendanceEdit' && (
          <>
            <label>
              Seat
              <select name="seat" defaultValue={visit?.seat || seats[0]} required>
                {seats.map((seat) => (
                  <option key={seat}>{seat}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Check-in (IST)
                <input
                  name="checkIn"
                  type="datetime-local"
                  step="0.001"
                  defaultValue={visit ? inputDate(visit.checkIn) : undefined}
                  required
                />
              </label>
              <label>
                Check-out (IST)
                <input
                  name="checkOut"
                  type="datetime-local"
                  step="0.001"
                  defaultValue={visit?.checkOut ? inputDate(visit.checkOut) : ''}
                />
              </label>
            </div>
            <p className="helper">
              Leave check-out empty only if the student is still in their assigned seat. Overlapping
              visits are rejected.
            </p>
            <label>
              Attendance note
              <textarea name="note" defaultValue={visit?.note || ''} maxLength={500} />
            </label>
          </>
        )}
        {modal.type === 'paymentVoid' && (
          <p>
            This receipt will be excluded from totals. Its record and correction history will remain
            available under voided receipts.
          </p>
        )}
        {modal.type === 'paymentRestore' && (
          <p>
            This receipt will count toward fees again, provided there is no other active receipt for
            the same student and month.
          </p>
        )}
        {modal.type === 'studentRestore' && (
          <p>
            {modal.student.name} will become active with an unassigned seat. Edit the student to
            assign a seat.
          </p>
        )}
        {modal.type === 'planArchive' && (
          <p>
            This plan will be hidden from new memberships. Move active members to another plan
            first.
          </p>
        )}
        {modal.type === 'planRestore' && (
          <p>This plan will be available for new memberships again.</p>
        )}
        {needsReason && (
          <label>
            Reason for correction
            <textarea
              name="reason"
              minLength={3}
              maxLength={500}
              placeholder="Explain what was incorrect"
              required
            />
          </label>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
