import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, Inbox } from 'lucide-react'
import type { LibraryState } from './types'
import { money, monthText } from './lib'

export function Card({
  title,
  extra,
  children,
  className = '',
}: {
  title?: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-heading">
          <h2>{title}</h2>
          {extra}
        </div>
      )}
      {children}
    </section>
  )
}
export function Stat({
  value,
  label,
  note,
  color = 'green',
}: {
  value: ReactNode
  label: string
  note?: string
  color?: string
}) {
  return (
    <div className="stat card">
      <div className={`stat-value ${color}`}>{value}</div>
      <h2>{label}</h2>
      {note && <p>{note}</p>}
    </div>
  )
}
export function Empty({ children = 'No records to display.' }: { children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <p>{children}</p>
    </div>
  )
}
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}
export function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement as HTMLElement
    el?.showModal()
    el?.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    )?.focus()
    return () => {
      el?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose()
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function RevenueChart({ state, month }: { state: LibraryState; month: string }) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${month}-01T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 5 + i)
    const key = d.toISOString().slice(0, 7)
    return {
      key,
      value: state.payments
        .filter((p) => p.month === key && !p.voided)
        .reduce((s, p) => s + p.amount, 0),
    }
  })
  const max = Math.max(1, ...months.map((m) => m.value))
  return (
    <div
      className="revenue-chart"
      role="img"
      aria-label={months.map((m) => `${monthText(m.key)}: ${money(m.value)}`).join(', ')}
    >
      {months.map((m, i) => (
        <div className="bar-group" key={m.key}>
          <span className="bar-value">{money(m.value)}</span>
          <div className="bar-track">
            <div
              className={`bar ${i === 5 ? 'current' : ''}`}
              style={{ height: `${(m.value / max) * 100}%` }}
            />
          </div>
          <span className="bar-label">
            {new Date(`${m.key}-01T12:00:00Z`).toLocaleDateString('en-IN', { month: 'short' })}
          </span>
        </div>
      ))}
    </div>
  )
}
