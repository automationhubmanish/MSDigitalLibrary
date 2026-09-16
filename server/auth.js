import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'

const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const getToken = (req) =>
  (req.headers.cookie || '')
    .split('; ')
    .find((c) => c.startsWith('ms_session='))
    ?.slice(11) || ''
const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  userId: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/,
      'Use a 3–40 character user ID with letters, numbers, dots, underscores or hyphens.',
    ),
  password: z.string().min(12, 'Use a password with at least 12 characters.').max(128),
})
const publicAccount = (account) => ({
  userId: account.user_id,
  name: account.name,
  role: account.role,
  studentId: account.student_id,
  createdAt: account.created_at,
})

export function installAuth({ app, db, read, demo, password, production }) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (user_id TEXT PRIMARY KEY COLLATE NOCASE, name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'pending', student_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS account_student ON accounts(student_id) WHERE student_id IS NOT NULL;`)
  if (
    !db
      .prepare('PRAGMA table_info(sessions)')
      .all()
      .some((column) => column.name === 'account_id')
  )
    db.exec('ALTER TABLE sessions ADD COLUMN account_id TEXT')
  const salt = randomBytes(16)
  const legacy = [
    {
      userId: normalize(process.env.ADMIN_USER_ID || 'owner'),
      email: normalize(process.env.ADMIN_EMAIL || 'owner@mslibrary.local'),
      hash: scryptSync(password || randomBytes(32).toString('hex'), salt, 64),
      role: 'owner',
    },
  ]
  if (process.env.STAFF_EMAIL && process.env.STAFF_PASSWORD?.length >= 12)
    legacy.push({
      userId: normalize(process.env.STAFF_USER_ID || 'staff'),
      email: normalize(process.env.STAFF_EMAIL),
      hash: scryptSync(process.env.STAFF_PASSWORD, salt, 64),
      role: 'staff',
    })
  const reserved = new Set([
    'owner',
    'staff',
    normalize(process.env.ADMIN_USER_ID),
    normalize(process.env.STAFF_USER_ID),
    ...legacy.flatMap((c) => [c.userId, c.email]),
  ])
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  }
  const limit = (count) =>
    rateLimit({
      windowMs: 15 * 60000,
      limit: count,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many attempts. Try again in 15 minutes.' },
    })
  app.post('/api/signup', limit(10), (req, res) => {
    const parsed = signupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
    const { name, password: value } = parsed.data
    const userId = normalize(parsed.data.userId)
    if (
      reserved.has(userId) ||
      db.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(userId)
    )
      return res.status(409).json({ error: 'That user ID is unavailable. Choose another.' })
    const accountSalt = randomBytes(16).toString('hex')
    const hash = scryptSync(value, accountSalt, 64).toString('hex')
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO accounts (user_id, name, salt, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, name, accountSalt, hash, 'pending', now, now)
    res.status(201).json({ userId, role: 'pending' })
  })
  app.post('/api/login', limit(15), (req, res) => {
    let role,
      accountId = null
    if (demo && req.body.demo === true) role = 'owner'
    else {
      const userId = normalize(req.body.userId ?? req.body.email)
      const value = typeof req.body.password === 'string' ? req.body.password : ''
      if (value.length > 256)
        return res.status(401).json({ error: 'Incorrect user ID or password.' })
      const configured = legacy.find((entry) => entry.userId === userId || entry.email === userId)
      const account = configured
        ? null
        : db.prepare('SELECT * FROM accounts WHERE user_id=?').get(userId)
      const expected = account
        ? Buffer.from(account.password_hash, 'hex')
        : (configured || legacy[0]).hash
      const actual = scryptSync(value, account ? account.salt : salt, 64)
      if (
        (!configured && !account) ||
        !timingSafeEqual(expected, actual) ||
        account?.role === 'disabled'
      )
        return res.status(401).json({ error: 'Incorrect user ID or password.' })
      role = configured?.role || account.role
      accountId = account?.user_id || null
    }
    const token = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM sessions WHERE expires < ? OR token = ?').run(
      Date.now(),
      hashToken(getToken(req)),
    )
    db.prepare('INSERT INTO sessions (token, role, expires, account_id) VALUES (?, ?, ?, ?)').run(
      hashToken(token),
      role,
      Date.now() + cookieOptions.maxAge,
      accountId,
    )
    res.cookie('ms_session', token, cookieOptions).json({ role })
  })
  app.use('/api', (req, res, next) => {
    const session = db
      .prepare('SELECT role, account_id FROM sessions WHERE token=? AND expires>?')
      .get(hashToken(getToken(req)), Date.now())
    if (!session) return res.status(401).json({ error: 'Please sign in to continue.' })
    const account = session.account_id
      ? db.prepare('SELECT * FROM accounts WHERE user_id=?').get(session.account_id)
      : null
    if (session.account_id && (!account || account.role === 'disabled'))
      return res.status(401).json({ error: 'Please sign in to continue.' })
    req.role = account?.role || session.role
    req.account = account
    next()
  })
  app.post('/api/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(getToken(req)))
    res.clearCookie('ms_session', { ...cookieOptions, maxAge: undefined }).json({ ok: true })
  })
  // Student and pending accounts never reach the management API or its full state.
  app.use('/api', (req, res, next) => {
    if (['owner', 'staff'].includes(req.role)) return next()
    if (req.method !== 'GET' || req.path !== '/state')
      return res.status(403).json({ error: 'This account cannot access library management.' })
    const state = read()
    const student =
      req.role === 'student' ? state.students.find((s) => s.id === req.account.student_id) : null
    res.json({
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      role: req.role,
      demo: state.demo,
      account: publicAccount(req.account),
      settings: state.settings,
      plans: state.plans.filter((p) => !p.archived || p.id === student?.planId),
      students: student ? [{ ...student, notes: '' }] : [],
      payments: student
        ? state.payments
            .filter((p) => p.studentId === student.id && !p.voided)
            .map(({ correctionReason: _reason, ...payment }) => payment)
        : [],
      attendance: student
        ? state.attendance
            .filter((a) => a.studentId === student.id)
            .map(({ note: _note, correctionReason: _reason, ...visit }) => visit)
        : [],
      audit: [],
    })
  })
  app.get('/api/accounts', (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can manage accounts.' })
    res.json(db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all().map(publicAccount))
  })
  app.post('/api/accounts/access', (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can manage accounts.' })
    const parsed = z
      .object({
        userId: z.string().min(3).max(40),
        role: z.enum(['pending', 'student', 'staff', 'disabled']),
        studentId: z.string().max(100).optional(),
      })
      .safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ error: 'Select an account and access level.' })
    const input = parsed.data
    const account = db
      .prepare('SELECT * FROM accounts WHERE user_id=?')
      .get(normalize(input.userId))
    if (!account) return res.status(404).json({ error: 'Account not found.' })
    const studentId = input.role === 'student' ? input.studentId : null
    if (
      input.role === 'student' &&
      !read().students.some((s) => s.id === studentId && !s.archivedAt)
    )
      return res.status(400).json({ error: 'Select an active student membership.' })
    if (
      studentId &&
      db
        .prepare('SELECT user_id FROM accounts WHERE student_id=? AND user_id<>?')
        .get(studentId, account.user_id)
    )
      return res.status(409).json({ error: 'This membership already has an account.' })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE accounts SET role=?, student_id=?, updated_at=? WHERE user_id=?').run(
        input.role,
        studentId,
        new Date().toISOString(),
        account.user_id,
      )
      db.prepare('DELETE FROM sessions WHERE account_id=?').run(account.user_id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    res.json({ ok: true })
  })
}
