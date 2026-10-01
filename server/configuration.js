import { z } from 'zod'

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const label = z.string().trim().min(1).max(50)
export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  floorName: label.default('Ground Floor'),
  seatRows: z
    .array(z.string().regex(/^[A-Z]$/))
    .min(1)
    .max(26)
    .refine((rows) => new Set(rows).size === rows.length, 'Seat row labels must be unique.')
    .default(['A', 'B', 'C', 'D', 'E', 'F']),
  seatsPerRow: z.number().int().min(1).max(30).default(9),
  weekdayOpen: timeSchema,
  weekdayClosed: z.boolean().default(false),
  weekdayClose: timeSchema,
  sundayOpen: timeSchema,
  sundayClosed: z.boolean().default(false),
  sundayClose: timeSchema,
  reminderTime: timeSchema,
  overtimeGraceMinutes: z.number().int().min(0).max(120).default(0),
  paymentMethods: z
    .array(label)
    .min(1)
    .max(10)
    .refine(
      (methods) => new Set(methods).size === methods.length,
      'Payment methods must be unique.',
    )
    .default(['UPI', 'Cash', 'Bank transfer']),
  timeSlots: z
    .array(
      z
        .object({ name: label, start: timeSchema, end: timeSchema })
        .refine((slot) => slot.start < slot.end, 'A time slot must end after it starts.'),
    )
    .max(12)
    .default([
      { name: 'Morning', start: '06:00', end: '12:00' },
      { name: 'Day', start: '08:00', end: '16:00' },
      { name: 'Evening', start: '16:00', end: '22:00' },
    ]),
  reminderTemplate: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .default(
      'Hello {name}, your {plan} library fee of {amount} for {month} is due. Please contact {library} to renew your membership. Seat: {seat}. Thank you.',
    ),
})
export const defaultSettings = settingsSchema.parse({
  name: 'MS Digital Library',
  weekdayOpen: '06:00',
  weekdayClose: '22:00',
  sundayOpen: '07:00',
  sundayClose: '20:00',
  reminderTime: '18:00',
})
export const getSeats = (settings) =>
  settings.seatRows.flatMap((row) =>
    Array.from(
      { length: settings.seatsPerRow },
      (_, i) => `${row}${i + 1}`,
    ),
  )

// Layout changes retain students and all historical visits. Invalid assignments are released.
export function reconcileLayout(state, reason, timestamp = new Date().toISOString()) {
  const valid = new Set(getSeats(state.settings))
  const released = []
  for (const student of state.students) {
    const normalized = String(student.seat || '').replace(/^([A-Z])-0?(\d+)$/, (_, row, n) => row + Number(n))
    if (student.seat && !valid.has(normalized)) {
      released.push({ studentId: student.id, name: student.name, oldSeat: student.seat })
      student.seat = ''
    }
  }
  for (const visit of state.attendance) {
    const normalized = String(visit.seat || '').replace(/^([A-Z])-0?(\d+)$/, (_, row, n) => row + Number(n))
    if (!visit.checkOut && !valid.has(normalized)) {
      visit.checkOut = timestamp
      visit.note = reason
      visit.closedByLayoutChange = true
    }
  }
  return released
}

function migrateLegacyLayout(original) {
  if (original.schemaVersion >= 2) return original
  const state = structuredClone(original)
  state.settings = settingsSchema.parse({
    ...defaultSettings,
    ...state.settings,
    seatRows: defaultSettings.seatRows,
    seatsPerRow: 9,
  })
  state.audit = state.audit || []
  const date = new Date().toISOString()
  const released = reconcileLayout(
    state,
    'Session closed automatically when the layout changed to 54 seats.',
    date,
  )
  state.layoutNotice = {
    date,
    message:
      'Layout updated to rows A–F, 9 seats per row. Students on removed seats are unassigned; their history is retained.',
    released,
  }
  state.audit.unshift({
    id: `migration-${date}`,
    date,
    role: 'system',
    type: 'layout.migration',
    before: original.settings,
    after: state.settings,
    released,
  })
  state.schemaVersion = 2
  state.revision++
  return state
}


// Rename legacy labels without releasing seats or closing active visits.
export function migrateState(original) {
  if (original.schemaVersion >= 3) return original
  const layout = migrateLegacyLayout(original)
  const state = structuredClone(layout)
  const rename = (label) => {
    const match = String(label || '').match(/^([A-Z])-0?(\d+)$/)
    return match ? `${match[1]}${Number(match[2])}` : label
  }
  for (const student of state.students) student.seat = rename(student.seat)
  for (const visit of state.attendance) visit.seat = rename(visit.seat)
  const date = new Date().toISOString()
  state.audit = state.audit || []
  state.audit.unshift({id: `seat-labels-${date}`, date, role: 'system', type: 'seat.labels.migration', reason: 'Seat labels updated from A-01 to A1. Assignments and attendance retained.'})
  state.schemaVersion = 3
  state.revision++
  return state
}
