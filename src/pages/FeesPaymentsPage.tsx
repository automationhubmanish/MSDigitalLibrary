import { useState } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck, Printer } from 'lucide-react'
import type { Payment } from '../types'
import { Card, Stat, Empty, Badge, Detail, RevenueChart, ModalShell } from '../components'
import { money, dateText, monthText } from '../lib'
import type { PageProps } from './pageTypes'
import { getMetrics } from '../utils/libraryMetrics'

export function FeesPaymentsPage({ state, setModal, month }: PageProps & { month: string }) {
  const m = getMetrics(state, month),
    [receipt, setReceipt] = useState<Payment | null>(null),
    [page, setPage] = useState(0),
    [receiptFilter, setReceiptFilter] = useState('active')
  const filteredPayments = state.payments.filter(
    (p) =>
      p.month === month &&
      (receiptFilter === 'all' || (receiptFilter === 'voided' ? p.voided : !p.voided)),
  )
  const sorted = [...filteredPayments].sort((a, b) => b.date.localeCompare(a.date)),
    currentPage = Math.min(page, Math.max(0, Math.ceil(sorted.length / 10) - 1))
  return (
    <>
      <div className="stats-grid">
        <Stat value={money(m.collected)} label="Collected" note={monthText(month)} />
        <Stat
          value={money(m.due)}
          label="Pending"
          note={`${m.pending.length} students`}
          color="orange"
        />
        <Stat
          value={money(m.expected)}
          label="Expected"
          note="Selected billing month"
          color="blue"
        />
        <Stat
          value={`${m.expected ? ((m.collected / m.expected) * 100).toFixed(1) : '0'}%`}
          label="Collection Rate"
          note="Recorded payments / expected fees"
          color="purple"
        />
      </div>
      <div className="wide-columns">
        <Card title="Monthly Collection">
          <p className="helper">Fees recorded by billing month · last 6 months</p>
          <RevenueChart state={state} month={month} />
        </Card>
        <Card
          title="Pending Dues"
          extra={<span className="count-label">{m.pending.length} students</span>}
        >
          <div className="pending-list">
            {m.pending.map((s) => (
              <button key={s.id} onClick={() => setModal({ type: 'payment', student: s, month })}>
                <strong>{s.name}</strong>
                <span>{money(s.monthlyFee)} · Unpaid</span>
              </button>
            ))}
            {!m.pending.length && <Empty>All fees are up to date for this month.</Empty>}
          </div>
        </Card>
      </div>
      <Card
        title="Recent Transactions"
        extra={
          <select
            aria-label="Receipt status"
            value={receiptFilter}
            onChange={(e) => {
              setReceiptFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="active">Active receipts</option>
            <option value="voided">Voided receipts</option>
            <option value="all">All receipts</option>
          </select>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Student</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(currentPage * 10, currentPage * 10 + 10).map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="text-button" onClick={() => setReceipt(p)}>
                      {p.id}
                      {p.voided ? ' (voided)' : ''}
                    </button>
                  </td>
                  <td>
                    <strong>{p.studentName}</strong>
                  </td>
                  <td>{p.planName}</td>
                  <td className="green">
                    <strong>{money(p.amount)}</strong>
                  </td>
                  <td>{p.mode}</td>
                  <td>{dateText(p.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredPayments.length && <Empty>No payments recorded for this month.</Empty>}
        </div>
        <div className="pagination">
          <span>
            {sorted.length
              ? `${currentPage * 10 + 1}–${Math.min(sorted.length, currentPage * 10 + 10)} of ${sorted.length}`
              : '0 transactions'}
          </span>
          <div>
            <button
              className="icon-button"
              disabled={!currentPage}
              aria-label="Previous transactions"
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button"
              disabled={(currentPage + 1) * 10 >= sorted.length}
              aria-label="Next transactions"
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>
      <div className="info-strip">
        <ShieldCheck size={15} />
        Payments are recorded once per student per month. Select a receipt to view or print it.
      </div>
      {receipt && (
        <ModalShell title="Payment receipt" onClose={() => setReceipt(null)}>
          <div className="receipt-print">
            <p className="eyebrow">{state.settings.name}</p>
            <h2>{money(receipt.amount)}</h2>
            <Badge tone={receipt.voided ? 'orange' : 'green'}>
              {receipt.voided ? 'Receipt voided' : 'Payment recorded'}
            </Badge>
            <div className="detail-list">
              <Detail label="Receipt">{receipt.id}</Detail>
              <Detail label="Student">{receipt.studentName}</Detail>
              <Detail label="Student ID">{receipt.studentId}</Detail>
              <Detail label="Membership">{receipt.planName}</Detail>
              <Detail label="Billing month">{monthText(receipt.month)}</Detail>
              <Detail label="Payment mode">{receipt.mode}</Detail>
              <Detail label="Recorded on">{dateText(receipt.date, true)}</Detail>
              {receipt.reference && <Detail label="Reference">{receipt.reference}</Detail>}
            </div>
          </div>
          <div className="form-actions">
            {state.role === 'owner' && (
              <>
                {!receipt.voided && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setReceipt(null)
                      setModal({ type: 'paymentEdit', payment: receipt })
                    }}
                  >
                    Edit payment
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => {
                    setReceipt(null)
                    setModal({
                      type: receipt.voided ? 'paymentRestore' : 'paymentVoid',
                      payment: receipt,
                    })
                  }}
                >
                  {receipt.voided ? 'Restore receipt' : 'Void receipt'}
                </button>
              </>
            )}
            <button className="button primary" onClick={() => window.print()}>
              <Printer size={15} />
              Print / Save PDF
            </button>
          </div>
        </ModalShell>
      )}
    </>
  )
}
