import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { today } from './domain.js'

const requestSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['fee', 'announcement', 'alert']),
    text: z.string().trim().max(1000).default(''),
    studentId: z.string().max(100).optional(),
  })
  .refine(
    (value) => value.kind === 'fee' || value.text.length >= 3,
    'Write a message of at least 3 characters.',
  )
const digest = (value) => createHash('sha256').update(value).digest('hex')
const money = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)

export function feeMessage(state, student, month = today().slice(0, 7)) {
  const values = {
    name: student.name,
    plan: state.plans.find((p) => p.id === student.planId)?.name || '',
    amount: money(student.monthlyFee),
    month: new Date(`${month}-01T12:00:00+05:30`).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }),
    library: state.settings.name,
    seat: student.seat || 'Unassigned',
  }
  return state.settings.reminderTemplate.replace(
    /\{(name|plan|amount|month|library|seat)\}/g,
    (_, key) => values[key],
  )
}

export function twilioProvider(env = process.env, fetcher = fetch) {
  const channel = env.NOTIFICATION_CHANNEL === 'sms' ? 'sms' : 'whatsapp'
  const account = env.TWILIO_ACCOUNT_SID || ''
  const token = env.TWILIO_AUTH_TOKEN || ''
  const from = env.TWILIO_FROM || ''
  const templates = {
    fee: env.TWILIO_FEE_TEMPLATE_SID,
    announcement: env.TWILIO_ANNOUNCEMENT_TEMPLATE_SID,
    alert: env.TWILIO_ALERT_TEMPLATE_SID,
  }
  const enabled = env.NOTIFICATIONS_ENABLED === 'true'
  const baseReady =
    enabled && /^AC[0-9a-f]{32}$/i.test(account) && !!token && /^\+[1-9]\d{7,14}$/.test(from)
  const ready = (kind) =>
    baseReady && (channel === 'sms' || /^HX[0-9a-f]{32}$/i.test(templates[kind] || ''))
  return {
    channel,
    ready,
    async send(item) {
      if (!ready(item.kind))
        throw new Error('Messaging provider is not configured for this message type.')
      const prefix = channel === 'whatsapp' ? 'whatsapp:' : ''
      const body = new URLSearchParams({
        To: `${prefix}+91${item.phone}`,
        From: `${prefix}${from}`,
      })
      if (channel === 'whatsapp') {
        body.set('ContentSid', templates[item.kind])
        body.set(
          'ContentVariables',
          JSON.stringify({
            1: item.studentName,
            2: item.libraryName,
            3: item.message.replace(/\s+/g, ' ').trim(),
          }),
        )
      } else body.set('Body', item.message)
      let response
      try {
        response = await fetcher(
          `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
            signal: AbortSignal.timeout(15000),
          },
        )
      } catch {
        throw Object.assign(
          new Error(
            'Provider response unavailable. Check the provider console before sending again.',
          ),
          { uncertain: true },
        )
      }
      const result = await response.json().catch(() => ({}))
      if (!response.ok)
        throw Object.assign(
          new Error(
            `Provider rejected the message${result.code ? ` (code ${result.code})` : ''}. Check the provider console.`,
          ),
          { uncertain: response.status >= 500 },
        )
      if (!/^SM[0-9a-f]{32}$/i.test(result.sid || ''))
        throw Object.assign(
          new Error('Provider response could not be verified. Check the provider console.'),
          { uncertain: true },
        )
      return {
        providerId: result.sid,
        status: ['failed', 'undelivered', 'canceled'].includes(result.status)
          ? 'failed'
          : 'accepted',
      }
    },
  }
}

// Persist each recipient before contacting the provider. An interrupted send is
// marked unknown on restart, never retried automatically to avoid duplicate SMS/WhatsApp.
export function createNotifications({ app, db, read, demo, provider = twilioProvider() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_batches (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created TEXT NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_items (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, dedupe TEXT NOT NULL UNIQUE, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_drafts (kind TEXT PRIMARY KEY, text TEXT NOT NULL);`)
  db.prepare("UPDATE notification_items SET status='unknown' WHERE status='sending'").run()
  let working = false,
    stopped = false
  const status = () => ({
    channel: provider.channel,
    mode: demo ? 'simulation' : 'live',
    ready: Object.fromEntries(
      ['fee', 'announcement', 'alert'].map((kind) => [kind, demo || provider.ready(kind)]),
    ),
  })
  const list = () =>
    db
      .prepare(
        'SELECT b.id, b.created, b.kind, b.mode, i.status, i.data FROM notification_batches b JOIN notification_items i ON i.batch_id=b.id ORDER BY b.created DESC, i.rowid DESC LIMIT 300',
      )
      .all()
      .map(({ data, ...item }) => ({ ...item, ...JSON.parse(data) }))
  const setItem = (id, state, data) =>
    db
      .prepare('UPDATE notification_items SET status=?, data=? WHERE id=?')
      .run(state, JSON.stringify(data), id)
  const pump = async () => {
    if (working || stopped) return
    working = true
    try {
      while (!stopped) {
        const row = db
          .prepare(
            "SELECT i.*, b.mode, b.kind FROM notification_items i JOIN notification_batches b ON b.id=i.batch_id WHERE i.status='queued' ORDER BY i.rowid LIMIT 1",
          )
          .get()
        if (!row) break
        const item = JSON.parse(row.data)
        const current = read()
        const student = current.students.find((s) => s.id === item.studentId && !s.archivedAt)
        if (
          !student ||
          student.phone !== item.phone ||
          (row.kind === 'fee' &&
            (student.monthlyFee !== item.amount ||
              current.payments.some(
                (p) => p.studentId === item.studentId && p.month === item.month && !p.voided,
              )))
        ) {
          setItem(row.id, 'skipped', {
            ...item,
            error: 'Student or fee details changed before sending.',
          })
          continue
        }
        if (row.mode === 'simulation') {
          setItem(row.id, 'simulated', item)
          continue
        }
        if (demo || !provider.ready(row.kind)) {
          setItem(row.id, 'failed', {
            ...item,
            error: 'Live sending is disabled or the provider is not configured.',
          })
          continue
        }
        db.prepare("UPDATE notification_items SET status='sending' WHERE id=?").run(row.id)
        try {
          const result = await provider.send({ ...item, kind: row.kind })
          setItem(row.id, result.status, { ...item, providerId: result.providerId })
        } catch (error) {
          setItem(row.id, error.uncertain ? 'unknown' : 'failed', { ...item, error: error.message })
        }
      }
    } finally {
      working = false
    }
  }
  const run = () => {
    void pump().catch((error) => console.error('Notification processing stopped:', error.message))
  }
  app.get('/api/notifications', (_req, res) =>
    res.json({
      ...status(),
      history: list(),
      drafts: Object.fromEntries(
        db
          .prepare('SELECT kind, text FROM notification_drafts')
          .all()
          .map((d) => [d.kind, d.text]),
      ),
    }),
  )
  app.post('/api/notifications/draft', (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can edit broadcasts.' })
    const parsed = z
      .object({ kind: z.enum(['announcement', 'alert']), text: z.string().trim().max(1000) })
      .safeParse(req.body)
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'Choose a message type and enter up to 1,000 characters.' })
    db.prepare(
      'INSERT INTO notification_drafts VALUES (?, ?) ON CONFLICT(kind) DO UPDATE SET text=excluded.text',
    ).run(parsed.data.kind, parsed.data.text)
    res.json({ ok: true })
  })
  app.post('/api/notifications/send', (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can send notifications.' })
    const parsed = requestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
    const input = parsed.data
    const fingerprint = digest(
      JSON.stringify({ kind: input.kind, text: input.text, studentId: input.studentId }),
    )
    const existing = db
      .prepare('SELECT * FROM notification_batches WHERE id=?')
      .get(input.requestId)
    if (existing)
      return existing.fingerprint === fingerprint
        ? res.json({ id: existing.id, duplicate: true, queued: 0, mode: existing.mode })
        : res.status(409).json({ error: 'Request already used for a different notification.' })
    if (!demo && !provider.ready(input.kind))
      return res
        .status(503)
        .json({ error: 'Connect your messaging provider in the server .env file before sending.' })
    const state = read(),
      date = today(),
      month = date.slice(0, 7),
      mode = demo ? 'simulation' : 'live'
    const targets = state.students.filter(
      (s) =>
        !s.archivedAt &&
        s.joined <= date &&
        /^[6-9]\d{9}$/.test(s.phone) &&
        (!input.studentId || s.id === input.studentId) &&
        (input.kind !== 'fee' ||
          !state.payments.some((p) => p.studentId === s.id && p.month === month && !p.voided)),
    )
    if (!targets.length)
      return res.status(400).json({ error: 'No eligible students for this notification.' })
    if (input.kind !== 'fee' && input.studentId)
      return res
        .status(400)
        .json({ error: 'Announcements and alerts are sent to all active students.' })
    let queued = 0
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO notification_batches VALUES (?, ?, ?, ?, ?)').run(
        input.requestId,
        fingerprint,
        new Date().toISOString(),
        input.kind,
        mode,
      )
      for (const student of targets) {
        const message =
          input.kind === 'fee'
            ? feeMessage(state, student, month)
            : `${state.settings.name} — ${input.kind === 'alert' ? 'Alert' : 'Announcement'}\n${input.text}`
        const dedupe = digest(
          `${mode}:${date}:${input.kind}:${student.id}:${input.kind === 'fee' ? month : input.text}`,
        )
        const item = {
          studentId: student.id,
          studentName: student.name,
          phone: student.phone,
          libraryName: state.settings.name,
          message,
          month,
          amount: student.monthlyFee,
          channel: provider.channel,
        }
        queued += Number(
          db
            .prepare('INSERT OR IGNORE INTO notification_items VALUES (?, ?, ?, ?, ?)')
            .run(randomUUID(), input.requestId, dedupe, 'queued', JSON.stringify(item)).changes,
        )
      }
      if (input.kind !== 'fee')
        db.prepare(
          'INSERT INTO notification_drafts VALUES (?, ?) ON CONFLICT(kind) DO UPDATE SET text=excluded.text',
        ).run(input.kind, input.text)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    res.status(202).json({ id: input.requestId, queued, skipped: targets.length - queued, mode })
    run()
  })
  run()
  return {
    snapshot: () => ({
      batches: db.prepare('SELECT * FROM notification_batches').all(),
      items: db.prepare('SELECT * FROM notification_items').all(),
      drafts: db.prepare('SELECT * FROM notification_drafts').all(),
    }),
    stop: () => {
      stopped = true
    },
    idle: async () => {
      while (working) await new Promise((resolve) => setTimeout(resolve, 10))
    },
  }
}
