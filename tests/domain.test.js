import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createState, applyAction, today, monthEnd } from '../server/domain.js'
const student = (overrides = {}) => ({ name: 'Test Student', phone: '9876543210', planId: '8h', seat: 'A-01', startTime: '08:00', joined: today(), notes: '', ...overrides })
const add = (state, values) => applyAction(state, { type: 'student.save', student: student(values) })
test('demo data has 84 students, 44 occupied seats, 6 reservations, and unique seat assignments', () => {
  const state = createState(true)
  assert.equal(state.students.length, 84)
  assert.equal(state.attendance.filter(a => !a.checkOut).length, 44)
  const assigned = state.students.filter(s => s.seat)
  assert.equal(assigned.length, 50)
  assert.equal(new Set(assigned.map(s => s.seat)).size, 50)
  assert.deepEqual(state.plans.map(p => p.fee), [400, 500, 600])
})
test('validates duplicate seats, duplicate phones, invalid seats, and invalid times', () => {
  const state = add(createState())
  assert.throws(() => add(state, { phone: '9876543211' }), /seat is already assigned/)
  assert.throws(() => add(state, { seat: 'B-01' }), /phone number already/)
  assert.throws(() => add(state, { phone: '9876543211', seat: 'A-99' }), /valid seat/)
  assert.throws(() => add(state, { phone: '9876543211', seat: '', startTime: '20:00' }), /past midnight/)
  assert.equal(state.students.length, 1)
})
test('payment records use server prices, prevent duplicates, and retain prior receipts', () => {
  let state = add(createState())
  const id = state.students[0].id, month = today().slice(0, 7)
  const action = { type: 'payment.collect', id, month, mode: 'Cash', amount: 1 }
  state = applyAction(state, action)
  assert.equal(state.payments[0].amount, 500)
  assert.equal(state.students[0].validUntil, monthEnd(month))
  assert.throws(() => applyAction(state, action), /already been collected/)
  state = applyAction(state, { type: 'plan.save', id: '8h', plan: { ...state.plans[1], fee: 700 } })
  assert.equal(state.students[0].monthlyFee, 500)
  assert.equal(state.payments[0].amount, 500)
})
test('check-in requires a seat; changing an occupied seat requires check-out; archive releases it', () => {
  let state = add(createState(), { seat: '' })
  const id = state.students[0].id
  assert.throws(() => applyAction(state, { type: 'attendance.toggle', id }), /Assign a seat/)
  state = applyAction(state, { type: 'student.save', id, student: student() })
  state = applyAction(state, { type: 'attendance.toggle', id })
  assert.equal(state.attendance.filter(a => !a.checkOut).length, 1)
  assert.throws(() => applyAction(state, { type: 'student.save', id, student: student({ seat: 'B-01' }) }), /Check the student out/)
  state = applyAction(state, { type: 'student.archive', id })
  assert.equal(state.students[0].seat, '')
  assert.ok(state.attendance[0].checkOut)
  assert.ok(state.students[0].archivedAt)
})
test('staff cannot change plans or settings and settings reject invalid opening hours', () => {
  const state = createState()
  assert.throws(() => applyAction(state, { type: 'plan.save', id: '6h', plan: state.plans[0] }, 'staff'), /Only the owner/)
  assert.throws(() => applyAction(state, { type: 'settings.save', settings: state.settings }, 'staff'), /Only the owner/)
  assert.throws(() => applyAction(state, { type: 'settings.save', settings: { ...state.settings, weekdayOpen: '23:00' } }), /Closing time/)
})
