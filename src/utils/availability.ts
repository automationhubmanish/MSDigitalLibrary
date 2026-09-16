import type { LibraryState, Student } from '../types'
import { timeText } from '../lib'

export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export const studentHours = (state: LibraryState, student: Student) =>
  student.dailyHours ?? state.plans.find((plan) => plan.id === student.planId)?.hours ?? 0
export const endTime = (start: string, hours: number) => {
  const end = minutes(start) + hours * 60
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}
export const studyWindow = (state: LibraryState, student: Student) => {
  const hours = studentHours(state, student)
  return `${timeText(student.startTime)} – ${timeText(endTime(student.startTime, hours))}${minutes(student.startTime) + hours * 60 === 1440 ? ' (midnight)' : ''}`
}
export function openingWindow(state: LibraryState, day: string) {
  const sunday = new Date(`${day}T12:00:00+05:30`).getUTCDay() === 0
  const settings = state.settings
  return {
    start: sunday ? settings.sundayOpen : settings.weekdayOpen,
    end: sunday ? settings.sundayClose : settings.weekdayClose,
    closed: sunday ? !!settings.sundayClosed : !!settings.weekdayClosed,
  }
}
