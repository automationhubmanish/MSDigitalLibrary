import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defaultSettings, settingsSchema, getSeats, reconcileLayout } from './configuration.js'
import { recordActionSchemas, applyRecordAction } from './recordActions.js'

export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
export const monthEnd = (month) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
    .toISOString()
    .slice(0, 10)
export const seats = getSeats(defaultSettings)
const id = z.string().min(1).max(100)
const date = z.iso.date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const studentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  planId: id,
  seat: z.string(),
  startTime: time,
  dailyHours: z.number().min(0.5).max(24).multipleOf(0.5).nullable().optional(),
  joined: date,
  notes: z.string().max(1000).default(''),
  monthlyFee: z.number().int().min(0).max(100000).optional(),
})
const planSchema = z.object({
  name: z.string().trim().min(2).max(50),
  hours: z.number().int().min(1).max(24),
  fee: z.number().int().min(1).max(100000),
  description: z.string().trim().max(100),
})
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('student.save'), id: id.optional(), student: studentSchema }),
  z.object({ type: z.literal('student.archive'), id }),
  z.object({ type: z.literal('attendance.toggle'), id }),
  z.object({
    type: z.literal('payment.collect'),
    id,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    mode: z.string().min(1).max(50),
    reference: z.string().max(100).default(''),
  }),
  z.object({
    type: z.literal('plan.save'),
    id: id.optional(),
    plan: planSchema,
    applyPriceToMembers: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('settings.save'),
    settings: settingsSchema,
    releaseRemovedSeats: z.boolean().default(false),
  }),
  ...recordActionSchemas,
])
export function createState(demo = false) {
  const state = {
    schemaVersion: 2,
    revision: 0,
    demo,
    audit: [],
    students: [],
    payments: [],
    attendance: [],
    plans: [
      { id: '6h', name: '6 Hours', hours: 6, fee: 400, description: 'Morning / Evening' },
      { id: '8h', name: '8 Hours', hours: 8, fee: 500, description: 'Flexible Study' },
      { id: '12h', name: '12 Hours', hours: 12, fee: 600, description: 'Full Day' },
    ],
    settings: structuredClone(defaultSettings),
  }
  if (!demo) return state
  const names = [
    'Priya Sharma',
    'Rahul Verma',
    'Neha Singh',
    'Aman Gupta',
    'Simran Kaur',
    'Mohit Yadav',
    'Pooja Saini',
    'Deepak Kumar',
    'Kajal Mehta',
    'Ankit Singh',
    'Riya Patel',
    'Vivek Sharma',
  ]
  const first = [
    'Aditya',
    'Sakshi',
    'Rohit',
    'Anjali',
    'Karan',
    'Muskan',
    'Nikhil',
    'Ishita',
    'Saurabh',
    'Sneha',
    'Harsh',
    'Divya',
  ]
  const last = ['Sharma', 'Verma', 'Singh', 'Gupta', 'Yadav', 'Patel']
  const day = today(),
    month = day.slice(0, 7)
  const start = new Date(`${month}-01T00:00:00Z`)
  start.setUTCMonth(start.getUTCMonth() - 5)
  for (let i = 0; i < 84; i++) {
    const plan = state.plans[i < 21 ? 0 : i < 50 ? 1 : 2]
    const student = {
      id: `MSL-${String(84 - i).padStart(4, '0')}`,
      name: names[i] || `${first[(i - 12) % 12]} ${last[Math.floor((i - 12) / 12)]}`,
      phone: `90000${String(i + 1).padStart(5, '0')}`,
      planId: plan.id,
      monthlyFee: plan.fee,
      seat: i < 50 ? seats[i] : '',
      startTime: '08:00',
      joined: start.toISOString().slice(0, 10),
      validUntil: i < 75 ? monthEnd(month) : monthEnd(start.toISOString().slice(0, 7)),
      notes: '',
      archivedAt: null,
    }
    state.students.push(student)
    for (let m = 0; m < 6; m++) {
      const d = new Date(start)
      d.setUTCMonth(d.getUTCMonth() + m)
      const period = d.toISOString().slice(0, 7)
      if (m === 5 && i >= 75) continue
      state.payments.push({
        id: `MSL-R${1000 + state.payments.length}`,
        studentId: student.id,
        studentName: student.name,
        planName: plan.name,
        amount: plan.fee,
        month: period,
        mode: i % 2 ? 'Cash' : 'UPI',
        reference: 'Sample transaction',
        date: `${period}-${String(Math.min(Number(day.slice(8)), (i % 10) + 1)).padStart(2, '0')}T08:00:00+05:30`,
      })
    }
    if (i < 44)
      state.attendance.push({
        id: randomUUID(),
        studentId: student.id,
        studentName: student.name,
        seat: student.seat,
        checkIn: new Date(Date.now() - (i + 1) * 60000).toISOString(),
        checkOut: null,
      })
  }
  return state
}
function requireThat(condition, message) {
  if (!condition) throw new Error(message)
}
export function applyAction(original, raw, role = 'owner') {
  const action = actionSchema.parse(raw)
  const state = structuredClone(original)
  const student = state.students.find((s) => s.id === action.id)
  const current = today()
  const availableSeats = getSeats(state.settings)
  const kind = action.type.split('.')[0]
  const collection = {
    student: 'students',
    payment: 'payments',
    attendance: 'attendance',
    plan: 'plans',
  }[kind]
  const before = structuredClone(
    kind === 'settings'
      ? state.settings
      : state[collection]?.find((item) => item.id === action.id) || null,
  )
  applyRecordAction(state, action, role)
  if (action.type === 'student.save') {
    const data = action.student
    const plan = state.plans.find((p) => p.id === data.planId)
    requireThat(plan && (!plan.archived || student?.planId === plan.id), 'Select an active plan.')
    requireThat(!action.id || student, 'Student no longer exists.')
    requireThat(data.joined <= current, 'Joining date cannot be in the future.')
    requireThat(!data.seat || availableSeats.includes(data.seat), 'Select a valid seat.')
    requireThat(
      !state.students.some((s) => s.id !== action.id && !s.archivedAt && s.phone === data.phone),
      'This phone number already belongs to a student.',
    )
    requireThat(
      !data.seat ||
        !state.students.some((s) => s.id !== action.id && !s.archivedAt && s.seat === data.seat),
      'This seat is already assigned. Choose another seat.',
    )
    requireThat(
      !student ||
        !state.attendance.some((a) => a.studentId === student.id && !a.checkOut) ||
        (student.seat === data.seat && student.planId === data.planId),
      'Check the student out before changing their seat or plan.',
    )
    const minutes = Number(data.startTime.slice(0, 2)) * 60 + Number(data.startTime.slice(3))
    const dailyHours = data.dailyHours ?? plan.hours
    requireThat(dailyHours <= plan.hours, 'Daily study hours cannot exceed the membership plan.')
    requireThat(
      minutes + dailyHours * 60 <= 24 * 60,
      'This plan extends past midnight. Choose an earlier start time.',
    )
    if (role !== 'owner' && data.monthlyFee !== undefined)
      requireThat(
        data.monthlyFee === (student?.monthlyFee ?? plan.fee),
        'Only the owner can change an agreed fee.',
      )
    if (student)
      Object.assign(student, data, {
        dailyHours: data.dailyHours ?? null,
        monthlyFee:
          data.monthlyFee ?? (student.planId === data.planId ? student.monthlyFee : plan.fee),
      })
    else
      state.students.unshift({
        ...data,
        id: `MSL-${String(Math.max(0, ...state.students.map((s) => Number(s.id.split('-')[1]))) + 1).padStart(4, '0')}`,
        monthlyFee: data.monthlyFee ?? plan.fee,
        validUntil: '',
        archivedAt: null,
      })
  }
  if (['student.archive', 'attendance.toggle', 'payment.collect'].includes(action.type))
    requireThat(student && !student.archivedAt, 'Select an active student.')
  if (action.type === 'student.archive') {
    student.archivedAt = current
    student.seat = ''
    state.attendance
      .filter((a) => a.studentId === student.id && !a.checkOut)
      .forEach((a) => {
        a.checkOut = new Date().toISOString()
      })
  }
  if (action.type === 'attendance.toggle') {
    const open = state.attendance.find((a) => a.studentId === student.id && !a.checkOut)
    if (open) open.checkOut = new Date().toISOString()
    else {
      requireThat(
        student.seat && availableSeats.includes(student.seat),
        'Assign a seat before checking in.',
      )
      requireThat(
        !state.attendance.some((a) => a.seat === student.seat && !a.checkOut),
        'This seat is occupied.',
      )
      state.attendance.unshift({
        id: randomUUID(),
        studentId: student.id,
        studentName: student.name,
        seat: student.seat,
        checkIn: new Date().toISOString(),
        checkOut: null,
      })
    }
  }
  if (action.type === 'payment.collect') {
    requireThat(
      action.month >= student.joined.slice(0, 7),
      'Cannot collect fees from before the joining month.',
    )
    requireThat(
      !state.payments.some(
        (p) => p.studentId === student.id && p.month === action.month && !p.voided,
      ),
      'Fees for this month have already been collected.',
    )
    requireThat(
      state.settings.paymentMethods.includes(action.mode),
      'Select a configured payment method.',
    )
    state.payments.unshift({
      id: `MSL-R${1000 + state.payments.length}`,
      studentId: student.id,
      studentName: student.name,
      planName: state.plans.find((p) => p.id === student.planId).name,
      amount: student.monthlyFee,
      month: action.month,
      mode: action.mode,
      reference: action.reference,
      date: new Date().toISOString(),
    })
    student.validUntil = [student.validUntil, monthEnd(action.month)].sort().at(-1)
  }
  if (action.type === 'plan.save') {
    requireThat(role === 'owner', 'Only the owner can change plans.')
    const plan = state.plans.find((p) => p.id === action.id)
    requireThat(!action.id || plan, 'Plan no longer exists.')
    requireThat(
      !plan ||
        !state.students.some(
          (s) =>
            s.planId === plan.id &&
            !s.archivedAt &&
            Number(s.startTime.slice(0, 2)) * 60 +
              Number(s.startTime.slice(3)) +
              (s.dailyHours ?? action.plan.hours) * 60 >
              1440,
        ),
      'These hours extend a member’s schedule past midnight. Adjust their start time first.',
    )
    requireThat(
      !plan || !state.students.some((s) => s.planId === plan.id && !s.archivedAt && s.dailyHours > action.plan.hours),
      'A member has more study hours than this plan. Adjust their daily hours first.',
    )
    if (plan) Object.assign(plan, action.plan)
    else state.plans.push({ id: randomUUID(), ...action.plan })
    if (plan && action.applyPriceToMembers)
      state.students
        .filter((s) => s.planId === plan.id && !s.archivedAt)
        .forEach((s) => {
          s.monthlyFee = action.plan.fee
        })
  }
  if (action.type === 'settings.save') {
    requireThat(role === 'owner', 'Only the owner can change settings.')
    requireThat(
      action.settings.weekdayOpen < action.settings.weekdayClose &&
        action.settings.sundayOpen < action.settings.sundayClose,
      'Closing time must be after opening time.',
    )
    const nextSeats = new Set(getSeats(action.settings))
    const affected = state.students.filter((s) => s.seat && !nextSeats.has(s.seat))
    const openAffected = state.attendance.some((a) => !a.checkOut && !nextSeats.has(a.seat))
    requireThat(
      (!affected.length && !openAffected) || action.releaseRemovedSeats,
      'Some removed seats are assigned or occupied. Confirm releasing affected seats before saving.',
    )
    state.settings = action.settings
    const released = reconcileLayout(
      state,
      'Session closed automatically after the owner changed the seat layout.',
    )
    if (released.length)
      state.layoutNotice = {
        date: new Date().toISOString(),
        message:
          'Seat layout changed. Affected students are unassigned and their history is retained.',
        released,
      }
  }
  state.audit ??= []
  state.audit.unshift({
    id: randomUUID(),
    date: new Date().toISOString(),
    role,
    type: action.type,
    recordId: action.id || null,
    reason: action.reason || '',
    before,
    after: structuredClone(
      kind === 'settings'
        ? state.settings
        : action.id
          ? state[collection]?.find((item) => item.id === action.id) || null
          : null,
    ),
  })
  state.revision++
  return state
}
