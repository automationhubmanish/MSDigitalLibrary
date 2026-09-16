import express from 'express'
import helmet from 'helmet'
import { z } from 'zod'
import { applyAction } from '../domain.js'
import { createPool, readState, writeState, transaction } from './database.js'
import { cloudIdentity, identityClients, accountView, normalize } from './identity.js'
import { cloudNotifications } from './notifications.js'

export function createCloudApp(options = {}) {
  const env = options.env || process.env,
    pool = options.pool || createPool(env),
    identity = options.identity || identityClients(env)
  const origin =
    options.origin ||
    env.PUBLIC_ORIGIN ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : env.VERCEL_URL
        ? `https://${env.VERCEL_URL}`
        : '')
  const secure = options.secure !== false
  if (!origin || (secure && !origin.startsWith('https://')))
    throw new Error('Set PUBLIC_ORIGIN to the HTTPS deployment URL.')
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'JSON requests required.' })
      if (
        (req.get('origin') && req.get('origin') !== origin) ||
        req.get('sec-fetch-site') === 'cross-site'
      )
        return res.status(403).json({ error: 'Untrusted request origin.' })
    }
    next()
  })
  const notifications = cloudNotifications({
    pool,
    provider: options.provider,
    schedule: options.schedule,
  })
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ ok: true, storage: 'supabase' })
  })
  app.get('/api/config', async (_req, res) => {
    const state = await readState(pool)
    res.json({
      demo: false,
      requiresEmail: true,
      name: state.settings.name,
      plans: state.plans.filter((p) => !p.archived),
    })
  })
  app.get('/api/cron/notifications', (req, res) => notifications.cron(req, res, env.CRON_SECRET))
  cloudIdentity({ app, pool, identity, origin, secure })
  app.get('/api/state', async (req, res) => {
    const state = await readState(pool)
    if (['owner', 'staff'].includes(req.role)) return res.json({ ...state, role: req.role })
    const student =
      req.role === 'student' ? state.students.find((s) => s.id === req.account.student_id) : null
    res.json({
      ...state,
      role: req.role,
      account: accountView(req.account),
      students: student ? [{ ...student, notes: '' }] : [],
      payments: student
        ? state.payments
            .filter((p) => p.studentId === student.id && !p.voided)
            .map(({ correctionReason: _reason, ...p }) => p)
        : [],
      attendance: student
        ? state.attendance
            .filter((a) => a.studentId === student.id)
            .map(({ note: _note, correctionReason: _reason, ...a }) => a)
        : [],
      audit: [],
      layoutNotice: undefined,
    })
  })
  app.use('/api', (req, res, next) =>
    ['owner', 'staff'].includes(req.role)
      ? next()
      : res.status(403).json({ error: 'This account cannot access library management.' }),
  )
  app.post('/api/actions', async (req, res) => {
    const next = await transaction(pool, async (client) => {
      const state = await readState(client, true)
      if (req.body.revision !== state.revision)
        throw Object.assign(new Error('Records changed on another device. Refresh and retry.'), {
          status: 409,
        })
      let next
      try {
        next = applyAction(state, req.body.action, req.role)
      } catch (error) {
        error.status = 400
        throw error
      }
      await writeState(client, next)
      return next
    })
    res.json({ ...next, role: req.role })
  })
  app.get('/api/backup', async (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can export backups.' })
    res
      .attachment('ms-library-backup.json')
      .json({ ...(await readState(pool)), notifications: await notifications.snapshot(true) })
  })
  app.get('/api/accounts', async (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can manage accounts.' })
    res.json(
      (
        await pool.query(
          "SELECT * FROM public.profiles WHERE role<>'owner' ORDER BY created_at DESC",
        )
      ).rows.map(accountView),
    )
  })
  app.post('/api/accounts/access', async (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can manage accounts.' })
    const input = z
      .object({
        userId: z.string().min(3).max(40),
        role: z.enum(['pending', 'student', 'staff', 'disabled']),
        studentId: z.string().max(100).optional(),
      })
      .parse(req.body)
    await transaction(pool, async (client) => {
      const state = await readState(client, true)
      const account = (
        await client.query('SELECT * FROM public.profiles WHERE user_id=$1 FOR UPDATE', [
          normalize(input.userId),
        ])
      ).rows[0]
      if (!account || account.role === 'owner')
        throw Object.assign(new Error('Select a registered student or staff account.'), {
          status: 400,
        })
      const studentId = input.role === 'student' ? input.studentId : null
      if (
        input.role === 'student' &&
        !state.students.some((s) => s.id === studentId && !s.archivedAt)
      )
        throw Object.assign(new Error('Select an active student membership.'), { status: 400 })
      await client.query(
        'UPDATE public.profiles SET role=$1,student_id=$2,updated_at=now() WHERE id=$3',
        [input.role, studentId, account.id],
      )
      await client.query('DELETE FROM public.cloud_sessions WHERE user_id=$1', [account.id])
      await client.query(
        'INSERT INTO public.account_audit(actor,user_id,before_role,after_role,student_id) VALUES($1,$2,$3,$4,$5)',
        [req.account.id, account.id, account.role, input.role, studentId],
      )
    })
    res.json({ ok: true })
  })
  notifications.routes(app)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))
  app.use((error, _req, res, _next) => {
    const status =
      error.status || (error instanceof z.ZodError ? 400 : error.code === '23505' ? 409 : 500)
    if (status >= 500) console.error('Cloud request failed:', error.code || error.name)
    res
      .status(status)
      .json({
        error:
          error.code === '23505'
            ? 'This account, seat or payment already exists.'
            : status < 500
              ? error.issues?.[0]?.message || error.message
              : 'Cloud service is unavailable. Check deployment configuration and retry.',
      })
  })
  return { app, pool, notifications }
}
