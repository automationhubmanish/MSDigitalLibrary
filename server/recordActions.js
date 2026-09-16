import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { getSeats } from './configuration.js'

const id = z.string().min(1).max(100)
const reason = z.string().trim().min(3, 'Please explain the correction.').max(500)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const datetime = z.iso.datetime({ offset: true })
export const recordActionSchemas = [
  z.object({ type: z.literal('student.restore'), id }),
  z.object({
    type: z.literal('payment.save'),
    id,
    payment: z.object({
      studentId: id,
      amount: z.number().int().min(0).max(100000),
      month,
      mode: z.string().min(1).max(50),
      reference: z.string().max(100),
      date: datetime,
    }),
    reason,
  }),
  z.object({ type: z.literal('payment.void'), id, reason }),
  z.object({ type: z.literal('payment.restore'), id, reason }),
  z.object({
    type: z.literal('attendance.save'),
    id: id.optional(),
    attendance: z.object({
      studentId: id,
      seat: z.string(),
      checkIn: datetime,
      checkOut: datetime.nullable(),
      note: z.string().max(500),
    }),
    reason,
  }),
  z.object({ type: z.literal('plan.archive'), id }),
  z.object({ type: z.literal('plan.restore'), id }),
]
function check(condition, message) {
  if (!condition) throw new Error(message)
}
function refreshValidity(state, studentId) {
  const student = state.students.find((s) => s.id === studentId)
  if (!student) return
  const latest = state.payments
    .filter((p) => p.studentId === studentId && !p.voided)
    .map((p) => p.month)
    .sort()
    .at(-1)
  student.validUntil = latest
    ? new Date(Date.UTC(Number(latest.slice(0, 4)), Number(latest.slice(5)), 0))
        .toISOString()
        .slice(0, 10)
    : ''
}
export function applyRecordAction(state, action, role) {
  if (!recordActionSchemas.some((schema) => schema.shape.type.value === action.type)) return
  check(role === 'owner', 'Only the owner can correct or restore records.')
  const now = new Date().toISOString()
  if (action.type === 'student.restore') {
    const student = state.students.find((s) => s.id === action.id)
    check(student?.archivedAt, 'Select an archived student.')
    check(
      !state.students.some(
        (s) => s.id !== student.id && !s.archivedAt && s.phone === student.phone,
      ),
      'An active student already uses this phone number.',
    )
    student.archivedAt = null
    student.seat = ''
  }
  if (action.type.startsWith('payment.')) {
    const payment = state.payments.find((p) => p.id === action.id)
    check(payment, 'Receipt no longer exists.')
    const previousStudent = payment.studentId
    const values = action.type === 'payment.save' ? action.payment : payment
    check(
      state.students.some((s) => s.id === values.studentId),
      'Select an existing student.',
    )
    if (action.type !== 'payment.void') {
      check(
        action.type === 'payment.restore' || !payment.voided,
        'Restore this voided receipt before editing.',
      )
      check(
        !state.payments.some(
          (p) =>
            p.id !== payment.id &&
            !p.voided &&
            p.studentId === values.studentId &&
            p.month === values.month,
        ),
        'Fees for this month have already been collected.',
      )
    }
    if (action.type === 'payment.save') {
      const student = state.students.find((s) => s.id === values.studentId)
      check(
        values.month >= student.joined.slice(0, 7),
        'Cannot record fees before the joining month.',
      )
      check(new Date(values.date).getTime() <= Date.now(), 'Payment date cannot be in the future.')
      check(
        state.settings.paymentMethods.includes(values.mode) || values.mode === payment.mode,
        'Select a configured payment method.',
      )
      Object.assign(payment, values, {
        studentName: student.name,
        planName:
          previousStudent === student.id
            ? payment.planName
            : state.plans.find((p) => p.id === student.planId)?.name || payment.planName,
      })
    }
    if (action.type === 'payment.void') {
      check(!payment.voided, 'This receipt is already voided.')
      payment.voided = true
    }
    if (action.type === 'payment.restore') {
      check(payment.voided, 'This receipt is not voided.')
      payment.voided = false
    }
    payment.correctionReason = action.reason
    payment.updatedAt = now
    refreshValidity(state, previousStudent)
    refreshValidity(state, payment.studentId)
  }
  if (action.type === 'attendance.save') {
    const visit = state.attendance.find((a) => a.id === action.id)
    check(!action.id || visit, 'Attendance record no longer exists.')
    const data = action.attendance,
      student = state.students.find((s) => s.id === data.studentId)
    check(student, 'Select an existing student.')
    const begin = new Date(data.checkIn).getTime(),
      end = data.checkOut ? new Date(data.checkOut).getTime() : Infinity
    check(
      begin <= Date.now() && (end === Infinity || end <= Date.now()),
      'Attendance times cannot be in the future.',
    )
    check(end > begin, 'Check-out must be after check-in.')
    check(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(data.checkIn)) >= student.joined,
      'Attendance cannot precede the joining date.',
    )
    const valid = getSeats(state.settings).includes(data.seat)
    check(
      valid || (visit && visit.seat === data.seat && data.checkOut),
      'Select a valid seat. Removed seats can only be retained in closed historical visits.',
    )
    if (!data.checkOut)
      check(
        !student.archivedAt && student.seat === data.seat,
        'An open visit must use the active student’s assigned seat.',
      )
    check(
      !state.attendance.some(
        (a) =>
          a.id !== action.id &&
          (a.studentId === data.studentId || a.seat === data.seat) &&
          begin < (a.checkOut ? new Date(a.checkOut).getTime() : Infinity) &&
          end > new Date(a.checkIn).getTime(),
      ),
      'This overlaps another visit for the student or seat.',
    )
    const values = {
      ...data,
      studentName: student.name,
      updatedAt: now,
      correctionReason: action.reason,
      closedByLayoutChange: false,
    }
    if (visit) Object.assign(visit, values)
    else state.attendance.unshift({ id: `ATT-${randomUUID()}`, ...values })
  }
  if (action.type === 'plan.archive' || action.type === 'plan.restore') {
    const plan = state.plans.find((p) => p.id === action.id)
    check(plan, 'Plan no longer exists.')
    if (action.type === 'plan.archive')
      check(
        !state.students.some((s) => !s.archivedAt && s.planId === plan.id),
        'Move active students to another plan before archiving this one.',
      )
    plan.archived = action.type === 'plan.archive'
  }
}
