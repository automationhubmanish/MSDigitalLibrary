import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createState, applyAction, today } from '../server/domain.js'
import { getSeats, migrateState } from '../server/configuration.js'

function add(state, values = {}) {
  return applyAction(state, { type: 'student.save', student: { name: 'Config Student', phone: '9876543201', planId: '8h', seat: 'A-09', startTime: '08:00', joined: '2020-01-01', notes: '', ...values } })
}
test('default configuration is exactly 54 unique seats and rejects a tenth seat', () => {
  const state = createState(), seats = getSeats(state.settings)
  assert.equal(seats.length, 54)
  assert.equal(new Set(seats).size, 54)
  assert.equal(seats[0], 'A-01'); assert.equal(seats.at(-1), 'F-09')
  assert.throws(() => add(state, { seat: 'A-10' }), /valid seat/)
})
test('legacy migration unassigns removed seats, closes affected visits, retains history, and runs once', () => {
  const legacy = add(createState())
  delete legacy.schemaVersion
  legacy.students[0].seat = 'A-12'
  legacy.attendance.push({ id: 'old-visit', studentId: legacy.students[0].id, seat: 'A-12', checkIn: new Date(Date.now() - 3600000).toISOString(), checkOut: null })
  const migrated = migrateState(legacy)
  assert.equal(migrated.students.length, legacy.students.length)
  assert.equal(migrated.students[0].seat, '')
  assert.equal(migrated.attendance.length, 1)
  assert.ok(migrated.attendance[0].closedByLayoutChange)
  assert.ok(migrated.attendance[0].checkOut)
  assert.equal(migrated.attendance[0].seat, 'A-12')
  assert.equal(migrated.layoutNotice.released[0].oldSeat, 'A-12')
  assert.equal(legacy.students[0].seat, 'A-12')
  assert.equal(migrateState(migrated), migrated)
})
test('layout expansion enables new seats; shrinking requires explicit release and keeps student history', () => {
  let state = createState()
  state = applyAction(state, { type: 'settings.save', settings: { ...state.settings, seatsPerRow: 10 } })
  state = add(state, { seat: 'F-10' })
  state = applyAction(state, { type: 'attendance.toggle', id: state.students[0].id })
  const action = { type: 'settings.save', settings: { ...state.settings, seatsPerRow: 9 } }
  assert.throws(() => applyAction(state, action), /Confirm releasing/)
  const next = applyAction(state, { ...action, releaseRemovedSeats: true })
  assert.equal(next.students[0].seat, '')
  assert.ok(next.attendance[0].checkOut)
  assert.equal(next.students.length, 1)
  assert.equal(state.students[0].seat, 'F-10')
})
test('owner can edit a receipt, void it, and restore it with validation and an audit trail', () => {
  let state = add(createState())
  const id = state.students[0].id, month = today().slice(0, 7)
  state = applyAction(state, { type: 'payment.collect', id, month, mode: 'Cash' })
  const receipt = state.payments[0]
  const edit = { type: 'payment.save', id: receipt.id, reason: 'Correct amount received', payment: { studentId: id, amount: 450, month, mode: 'Cash', reference: 'Corrected', date: receipt.date } }
  assert.throws(() => applyAction(state, edit, 'staff'), /Only the owner/)
  state = applyAction(state, edit)
  assert.equal(state.payments[0].amount, 450)
  assert.equal(state.audit[0].before.amount, 500)
  state = applyAction(state, { type: 'payment.void', id: receipt.id, reason: 'Duplicate entry correction' })
  assert.equal(state.students[0].validUntil, '')
  assert.equal(state.payments[0].voided, true)
  state = applyAction(state, { type: 'payment.restore', id: receipt.id, reason: 'Verified original payment' })
  assert.equal(state.payments[0].voided, false)
  assert.ok(state.students[0].validUntil)
})
test('attendance corrections validate overlap and check-out order, and record the reason', () => {
  let state = add(createState())
  const studentId = state.students[0].id
  const checkIn = new Date(Date.now() - 7200000).toISOString(), checkOut = new Date(Date.now() - 3600000).toISOString()
  const action = { type: 'attendance.save', reason: 'Missed register entry', attendance: { studentId, seat: 'A-09', checkIn, checkOut, note: 'Verified by owner' } }
  state = applyAction(state, action)
  assert.equal(state.attendance.length, 1)
  assert.throws(() => applyAction(state, action), /overlaps/)
  assert.throws(() => applyAction(state, { ...action, id: state.attendance[0].id, attendance: { ...action.attendance, checkOut: checkIn } }), /after check-in/)
  state = applyAction(state, { ...action, id: state.attendance[0].id, reason: 'Corrected note', attendance: { ...action.attendance, note: 'New note' } })
  assert.equal(state.attendance[0].note, 'New note')
  assert.equal(state.audit[0].reason, 'Corrected note')
})
test('owner-configured prices, hours, payment methods, and archived membership restoration work', () => {
  let state = add(createState(), { monthlyFee: 350 })
  const id = state.students[0].id
  assert.equal(state.students[0].monthlyFee, 350)
  state = applyAction(state, { type: 'plan.save', id: '8h', plan: { ...state.plans[1], hours: 7, fee: 480 }, applyPriceToMembers: true })
  assert.equal(state.students[0].monthlyFee, 480)
  state = applyAction(state, { type: 'settings.save', settings: { ...state.settings, paymentMethods: ['Cheque'], overtimeGraceMinutes: 15 } })
  assert.throws(() => applyAction(state, { type: 'payment.collect', id, month: today().slice(0, 7), mode: 'Cash' }), /configured payment/)
  state = applyAction(state, { type: 'payment.collect', id, month: today().slice(0, 7), mode: 'Cheque' })
  assert.equal(state.payments[0].mode, 'Cheque')
  state = applyAction(state, { type: 'student.archive', id })
  state = applyAction(state, { type: 'student.restore', id })
  assert.equal(state.students[0].archivedAt, null)
  assert.equal(state.students[0].seat, '')
  state = applyAction(state, { type: 'plan.archive', id: '6h' })
  assert.ok(state.plans[0].archived)
  state = applyAction(state, { type: 'plan.restore', id: '6h' })
  assert.equal(state.plans[0].archived, false)
})
