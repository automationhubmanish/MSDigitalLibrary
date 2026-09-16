import type { LibraryState } from '../types'
import { today, isPaid, activeVisit, getSeats } from '../lib'
export const activeStudents = (state: LibraryState) => state.students.filter((s) => !s.archivedAt)
export function getMetrics(state: LibraryState, month = today().slice(0, 7)) {
  const seats = getSeats(state.settings)
  const students = state.students.filter(
    (s) => s.joined.slice(0, 7) <= month && (!s.archivedAt || s.archivedAt.slice(0, 7) > month),
  )
  const payments = state.payments.filter((p) => p.month === month && !p.voided)
  const pending = students.filter((s) => !isPaid(state, s, month))
  const collected = payments.reduce((total, p) => total + p.amount, 0)
  const due = pending.reduce((total, s) => total + s.monthlyFee, 0)
  const occupied = state.attendance.filter((a) => !a.checkOut).length
  const reserved = activeStudents(state).filter((s) => s.seat && !activeVisit(state, s.id)).length
  return {
    totalSeats: seats.length,
    students,
    payments,
    pending,
    collected,
    due,
    expected: collected + due,
    occupied,
    reserved,
    available: seats.length - occupied - reserved,
  }
}
