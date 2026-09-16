import { useState } from 'react'
export function AttendanceButton({
  id,
  inLibrary,
  toggle,
}: {
  id: string
  inLibrary: boolean
  toggle: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="button secondary small"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await toggle(id)
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Saving…' : inLibrary ? 'Check-out' : 'Check-in'}
    </button>
  )
}
