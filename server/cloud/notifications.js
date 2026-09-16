import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { feeMessage, twilioProvider } from '../notifications.js'
import { today } from '../domain.js'
import { readState, transaction } from './database.js'

const digest = (value) => createHash('sha256').update(value).digest('hex')
export function cloudNotifications({
  pool,
  provider = twilioProvider(),
  schedule = (work) => {
    void work.catch(() => {})
  },
}) {
  const process = async (budget = 40000) => {
    const until = Date.now() + budget
    await pool.query(
      "UPDATE public.notification_items SET status='unknown' WHERE status='sending' AND claimed_at < now()-interval '2 minutes'",
    )
    while (Date.now() < until) {
      const rows = await transaction(
        pool,
        async (client) =>
          (
            await client.query(`WITH pending AS (SELECT id FROM public.notification_items WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 5)
        UPDATE public.notification_items i SET status='sending',claimed_at=now() FROM pending p WHERE i.id=p.id RETURNING i.*`)
          ).rows,
      )
      if (!rows.length) break
      const state = await readState(pool)
      await Promise.all(
        rows.map(async (row) => {
          const item = row.data
          const student = state.students.find((s) => s.id === item.studentId && !s.archivedAt)
          let status,
            result = item
          if (
            !student ||
            student.phone !== item.phone ||
            (item.kind === 'fee' &&
              (student.monthlyFee !== item.amount ||
                state.payments.some(
                  (p) => p.studentId === student.id && p.month === item.month && !p.voided,
                )))
          )
            status = 'skipped'
          else if (item.mode === 'simulation') status = 'simulated'
          else if (state.demo || !provider.ready(item.kind)) {
            status = 'failed'
            result = { ...item, error: 'Live delivery is disabled or not configured.' }
          } else
            try {
              const sent = await provider.send(item)
              status = sent.status
              result = { ...item, providerId: sent.providerId }
            } catch (error) {
              status = error.uncertain ? 'unknown' : 'failed'
              result = { ...item, error: error.message }
            }
          await pool.query(
            'UPDATE public.notification_items SET status=$1,data=$2::jsonb WHERE id=$3 AND status=$4',
            [status, JSON.stringify(result), row.id, 'sending'],
          )
        }),
      )
    }
  }
  const kick = () =>
    schedule(
      process().catch(() => {
        console.error(
          'Notification worker paused; queued work will resume on the next request or cron run.',
        )
      }),
    )
  const snapshot = async (all = false) => ({
    history: (
      await pool.query(
        `SELECT b.id,b.created,b.kind,b.mode,i.status,i.data FROM public.notification_items i JOIN public.notification_batches b ON b.id=i.batch_id ORDER BY b.created DESC,i.id ${all ? '' : 'LIMIT 300'}`,
      )
    ).rows.map(({ data, ...row }) => ({ ...row, ...data })),
    drafts: Object.fromEntries(
      (await pool.query('SELECT kind,text FROM public.notification_drafts')).rows.map((d) => [
        d.kind,
        d.text,
      ]),
    ),
  })
  const routes = (app) => {
    app.get('/api/notifications', async (_req, res) => {
      const state = await readState(pool)
      res.json({
        channel: provider.channel,
        mode: state.demo ? 'simulation' : 'live',
        ready: Object.fromEntries(
          ['fee', 'announcement', 'alert'].map((kind) => [
            kind,
            state.demo || provider.ready(kind),
          ]),
        ),
        ...(await snapshot()),
      })
      kick()
    })
    app.post('/api/notifications/draft', async (req, res) => {
      if (req.role !== 'owner')
        return res.status(403).json({ error: 'Only the owner can edit broadcasts.' })
      const input = z
        .object({ kind: z.enum(['announcement', 'alert']), text: z.string().trim().max(1000) })
        .parse(req.body)
      await pool.query(
        'INSERT INTO public.notification_drafts VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET text=excluded.text',
        [input.kind, input.text],
      )
      res.json({ ok: true })
    })
    app.post('/api/notifications/send', async (req, res) => {
      if (req.role !== 'owner')
        return res.status(403).json({ error: 'Only the owner can send notifications.' })
      const input = z
        .object({
          requestId: z.uuid(),
          kind: z.enum(['fee', 'announcement', 'alert']),
          text: z.string().trim().max(1000).default(''),
          studentId: z.string().min(1).max(100).optional(),
        })
        .parse(req.body)
      if (input.kind !== 'fee' && (input.text.length < 3 || input.studentId))
        return res
          .status(400)
          .json({ error: 'Enter an announcement or alert for all active students.' })
      const fingerprint = digest(
        JSON.stringify({ kind: input.kind, text: input.text, studentId: input.studentId }),
      )
      const result = await transaction(pool, async (client) => {
        const state = await readState(client, true)
        const existing = (
          await client.query('SELECT * FROM public.notification_batches WHERE id=$1', [
            input.requestId,
          ])
        ).rows[0]
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            throw Object.assign(new Error('Request ID already used.'), { status: 409 })
          return { id: existing.id, queued: 0, duplicate: true, mode: existing.mode }
        }
        if (!state.demo && !provider.ready(input.kind))
          throw Object.assign(new Error('Connect your messaging provider before sending.'), {
            status: 503,
          })
        const date = today(),
          month = date.slice(0, 7),
          mode = state.demo ? 'simulation' : 'live'
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
          throw Object.assign(new Error('No eligible students.'), { status: 400 })
        await client.query('INSERT INTO public.notification_batches VALUES($1,$2,$3,$4,$5)', [
          input.requestId,
          fingerprint,
          new Date().toISOString(),
          input.kind,
          mode,
        ])
        let queued = 0
        for (const s of targets) {
          const item = {
            kind: input.kind,
            mode,
            studentId: s.id,
            studentName: s.name,
            phone: s.phone,
            libraryName: state.settings.name,
            month,
            amount: s.monthlyFee,
            channel: provider.channel,
            message:
              input.kind === 'fee'
                ? feeMessage(state, s, month)
                : `${state.settings.name} — ${input.kind}\n${input.text}`,
          }
          const dedupe = digest(
            `${mode}:${date}:${input.kind}:${s.id}:${input.kind === 'fee' ? month : input.text}`,
          )
          queued += (
            await client.query(
              'INSERT INTO public.notification_items(id,batch_id,dedupe,status,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(dedupe) DO NOTHING',
              [randomUUID(), input.requestId, dedupe, 'queued', JSON.stringify(item)],
            )
          ).rowCount
        }
        if (input.kind !== 'fee')
          await client.query(
            'INSERT INTO public.notification_drafts VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET text=excluded.text',
            [input.kind, input.text],
          )
        return { id: input.requestId, queued, skipped: targets.length - queued, mode }
      })
      res.status(202).json(result)
      kick()
    })
  }
  const cron = async (req, res, secret) => {
    const expected = Buffer.from(`Bearer ${secret || ''}`),
      actual = Buffer.from(req.get('authorization') || '')
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return res.status(401).json({ error: 'Unauthorized' })
    await process()
    res.json({ ok: true })
  }
  return { routes, process, snapshot, cron }
}
