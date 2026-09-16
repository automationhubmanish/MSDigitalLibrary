import express from 'express'
import helmet from 'helmet'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createState, applyAction } from './domain.js'
import { migrateState } from './configuration.js'
import { createNotifications } from './notifications.js'
import { installAuth } from './auth.js'

export function createApp(options = {}) {
  const production = process.env.NODE_ENV === 'production'
  const demo =
    options.demo ??
    (process.env.DEMO_MODE === 'true' || (!production && process.env.DEMO_MODE !== 'false'))
  const password = options.password ?? process.env.ADMIN_PASSWORD
  if (!demo && (!password || password.length < 12))
    throw new Error('Set ADMIN_PASSWORD to at least 12 characters before starting.')
  if (production && !process.env.PUBLIC_ORIGIN)
    throw new Error('Set PUBLIC_ORIGIN to the HTTPS website URL.')
  if (production && !process.env.PUBLIC_ORIGIN.startsWith('https://'))
    throw new Error('PUBLIC_ORIGIN must use HTTPS in production.')
  const dbPath = options.dbPath ?? process.env.DATABASE_PATH ?? './data/library.sqlite'
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS library (id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, expires INTEGER NOT NULL);',
  )
  if (!db.prepare('SELECT id FROM library WHERE id=1').get())
    db.prepare('INSERT INTO library VALUES(1, ?)').run(JSON.stringify(createState(demo)))
  const read = () => JSON.parse(db.prepare('SELECT data FROM library WHERE id=1').get().data)
  if (!demo && read().demo)
    throw new Error(
      'This database contains sample data. Use a new DATABASE_PATH for the real library.',
    )
  const existing = read()
  const migrated = migrateState(existing)
  if (migrated !== existing) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS library_migrations (version INTEGER PRIMARY KEY, created TEXT NOT NULL, previous_data TEXT NOT NULL)',
      )
      db.prepare('INSERT INTO library_migrations VALUES (?, ?, ?)').run(
        2,
        new Date().toISOString(),
        JSON.stringify(existing),
      )
      db.prepare('UPDATE library SET data=? WHERE id=1').run(JSON.stringify(migrated))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  const app = express()
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? { directives: { 'style-src': ["'self'", "'unsafe-inline'"] } }
        : false,
    }),
  )
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'JSON requests required.' })
      const origin = req.get('origin')
      const allowed = production
        ? [process.env.PUBLIC_ORIGIN]
        : [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            ...(options.allowedOrigins || []),
          ]
      if (origin && !allowed.includes(origin))
        return res.status(403).json({ error: 'Untrusted request origin.' })
      if (req.get('sec-fetch-site') === 'cross-site')
        return res.status(403).json({ error: 'Cross-site request rejected.' })
    }
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.get('/api/config', (_req, res) => { const state = read(); res.json({ demo, name: state.settings.name, plans: state.plans.filter(p => !p.archived) }) })
  installAuth({ app, db, read, demo, password, production })
  app.get('/api/state', (req, res) => res.json({ ...read(), role: req.role }))
  app.get('/api/backup', (req, res) => {
    if (req.role !== 'owner')
      return res.status(403).json({ error: 'Only the owner can export a backup.' })
    res.attachment('ms-library-backup.json').json({ ...read(), notifications: notifications.snapshot() })
  })
  app.post('/api/actions', (req, res) => {
    try {
      db.exec('BEGIN IMMEDIATE')
      const state = read()
      if (req.body.revision !== state.revision) {
        db.exec('ROLLBACK')
        return res.status(409).json({
          error: 'Records changed on another device. Please retry with the refreshed data.',
        })
      }
      const next = applyAction(state, req.body.action, req.role)
      db.prepare('UPDATE library SET data=? WHERE id=1').run(JSON.stringify(next))
      db.exec('COMMIT')
      res.json({ ...next, role: req.role })
    } catch (error) {
      db.exec('ROLLBACK')
      res.status(400).json({ error: error.issues?.[0]?.message || error.message })
    }
  })
  const notifications = createNotifications({ app, db, read, demo, provider: options.notificationProvider })
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  app.use(express.static(dist))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  app.use((error, _req, res, _next) => {
    console.error(error.message)
    res.status(error.status === 400 ? 400 : 500).json({
      error:
        error.status === 400
          ? 'Invalid JSON request.'
          : 'The server could not complete the request.',
    })
  })
  return { app, db, notifications }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, db, notifications } = createApp()
  const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
    console.log(`MS Digital Library API ready on port ${process.env.PORT || 3001}`),
  )
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () =>
      server.close(async () => {
        notifications.stop()
        await notifications.idle()
        db.close()
        process.exit(0)
      }),
    )
}
