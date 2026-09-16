export interface Plan {
  archived?: boolean
  id: string
  name: string
  hours: number
  fee: number
  description: string
}
export interface Student {
  dailyHours?: number | null
  id: string
  name: string
  phone: string
  planId: string
  monthlyFee: number
  seat: string
  startTime: string
  joined: string
  validUntil: string
  notes: string
  archivedAt: string | null
}
export interface Payment {
  voided?: boolean
  correctionReason?: string
  updatedAt?: string
  id: string
  studentId: string
  studentName: string
  planName: string
  amount: number
  month: string
  mode: string
  reference: string
  date: string
}
export interface Attendance {
  note?: string
  correctionReason?: string
  closedByLayoutChange?: boolean
  id: string
  studentId: string
  studentName: string
  seat: string
  checkIn: string
  checkOut: string | null
}
export interface Settings {
  weekdayClosed?: boolean
  sundayClosed?: boolean
  floorName: string
  seatRows: string[]
  seatsPerRow: number
  overtimeGraceMinutes: number
  paymentMethods: string[]
  timeSlots: { name: string; start: string; end: string }[]
  reminderTemplate: string
  name: string
  weekdayOpen: string
  weekdayClose: string
  sundayOpen: string
  sundayClose: string
  reminderTime: string
}
export interface LibraryState {
  schemaVersion: number
  audit: {
    id: string
    date: string
    role: string
    type: string
    recordId?: string
    reason?: string
  }[]
  layoutNotice?: {
    date: string
    message: string
    released: { studentId: string; name: string; oldSeat: string }[]
  }
  revision: number
  role: 'owner' | 'staff' | 'student' | 'pending'
  account?: {
    userId: string
    name: string
    role: string
    studentId: string | null
    createdAt: string
  }
  demo: boolean
  students: Student[]
  plans: Plan[]
  payments: Payment[]
  attendance: Attendance[]
  settings: Settings
}
export type Page =
  'dashboard' | 'students' | 'seats' | 'fees' | 'plans' | 'reports' | 'notifications' | 'settings'
export type Modal =
  | { type: 'paymentEdit'; payment: Payment }
  | { type: 'paymentVoid' | 'paymentRestore'; payment: Payment }
  | { type: 'attendanceEdit'; attendance?: Attendance }
  | { type: 'studentRestore'; student: Student }
  | { type: 'planArchive' | 'planRestore'; plan: Plan }
  | { type: 'student'; student?: Student; seat?: string }
  | { type: 'payment'; student?: Student; month?: string }
  | { type: 'plan'; plan?: Plan }
  | { type: 'archive'; student: Student }
  | { type: 'reminder'; student: Student }
