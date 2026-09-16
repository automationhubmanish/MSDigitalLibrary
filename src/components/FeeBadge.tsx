import type { LibraryState, Student } from '../types'
import { Badge } from '../components'
import { isPaid } from '../lib'
export function FeeBadge({
  state,
  student,
  month,
}: {
  state: LibraryState
  student: Student
  month?: string
}) {
  return (
    <Badge tone={isPaid(state, student, month) ? 'green' : 'orange'}>
      {isPaid(state, student, month) ? 'Paid' : 'Due'}
    </Badge>
  )
}
