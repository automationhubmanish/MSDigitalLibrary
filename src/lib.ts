import type { LibraryState, Student, Settings } from './types'
export const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
export const dateText = (value: string, full = false) =>
  value
    ? new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value).toLocaleDateString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          ...(full ? { year: 'numeric' } : {}),
          timeZone: 'Asia/Kolkata',
        },
      )
    : 'Not paid yet'
export const clockText = (value: string) =>
  new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
export const timeText = (value: string) => clockText(`2026-01-01T${value}:00+05:30`)
export const localDay = (value: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(value))
export const monthText = (value: string) =>
  new Date(`${value}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
export const getSeats = (settings: Settings) =>
  settings.seatRows.flatMap((row) =>
    Array.from(
      { length: Math.max(0, Math.min(30, settings.seatsPerRow)) },
      (_, i) => `${row}-${String(i + 1).padStart(2, '0')}`,
    ),
  )
export const reminderMessage = (state: LibraryState, student: Student) => {
  const values: Record<string, string> = {
    name: student.name,
    plan: state.plans.find((p) => p.id === student.planId)?.name || '',
    amount: money(student.monthlyFee),
    month: monthText(today().slice(0, 7)),
    library: state.settings.name,
    seat: student.seat || 'Unassigned',
  }
  return state.settings.reminderTemplate.replace(
    /\{(name|plan|amount|month|library|seat)\}/g,
    (_, key: string) => values[key],
  )
}
export const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
export const isPaid = (state: LibraryState, student: Student, month = today().slice(0, 7)) =>
  state.payments.some((p) => p.studentId === student.id && p.month === month && !p.voided)
export const activeVisit = (state: LibraryState, id: string) =>
  state.attendance.find((a) => a.studentId === id && !a.checkOut)
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const result = await response
    .json()
    .catch(() => ({ error: 'The server returned an invalid response.' }))
  if (!response.ok)
    throw Object.assign(new Error(result.error || 'Something went wrong.'), {
      status: response.status,
    })
  return result
}
export function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    let text = String(v)
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const blob = new Blob(
    ['\uFEFF' + [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8;' },
  )
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
