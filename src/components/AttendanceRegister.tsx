import { useState } from 'react'
import type { LibraryState, Modal } from '../types'
import { Card, Empty } from '../components'
import { dateText, clockText, localDay, today } from '../lib'

export function AttendanceRegister({
  state,
  setModal,
}: {
  state: LibraryState
  setModal: (modal: Modal) => void
}) {
  const [day, setDay] = useState(today()),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0)
  const visits = [...state.attendance]
    .filter(
      (visit) =>
        (!day || localDay(visit.checkIn) === day) &&
        `${visit.studentName} ${visit.studentId} ${visit.seat}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visits.length / 10) - 1))
  return (
    <Card
      title="Attendance Register"
      extra={
        state.role === 'owner' && (
          <button
            className="button primary small"
            onClick={() => setModal({ type: 'attendanceEdit' })}
          >
            Add attendance record
          </button>
        )
      }
    >
      <div className="filter-bar">
        <input
          type="date"
          aria-label="Attendance date"
          value={day}
          onChange={(e) => {
            setDay(e.target.value)
            setPage(0)
          }}
        />
        <button
          className="text-button"
          onClick={() => {
            setDay('')
            setPage(0)
          }}
        >
          All dates
        </button>
        <input
          aria-label="Search attendance"
          placeholder="Student name, ID or seat"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Seat</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Note</th>
              {state.role === 'owner' && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {visits.slice(currentPage * 10, currentPage * 10 + 10).map((visit) => (
              <tr key={visit.id}>
                <td>{visit.studentName}</td>
                <td>{visit.seat}</td>
                <td>
                  {dateText(visit.checkIn)} · {clockText(visit.checkIn)}
                </td>
                <td>
                  {visit.checkOut
                    ? `${dateText(visit.checkOut)} · ${clockText(visit.checkOut)}`
                    : 'In library'}
                </td>
                <td className="wrap-cell">{visit.note || '—'}</td>
                {state.role === 'owner' && (
                  <td>
                    <button
                      className="text-button"
                      aria-label={`Edit attendance for ${visit.studentName}`}
                      onClick={() => setModal({ type: 'attendanceEdit', attendance: visit })}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!visits.length && <Empty>No visits match this filter.</Empty>}
      </div>
      <div className="pagination">
        <span>
          {visits.length} visits · Page {currentPage + 1} of{' '}
          {Math.max(1, Math.ceil(visits.length / 10))}
        </span>
        <div>
          <button
            className="button secondary small"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            className="button secondary small"
            disabled={(currentPage + 1) * 10 >= visits.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  )
}
