import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'

test('API authenticates, rejects stale writes and foreign origins, persists records, and invalidates logout', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ms-library-test-'))
  const dbPath = path.join(dir, 'library.sqlite')
  const { app, db } = createApp({ dbPath, demo: true })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  let cookie = ''
  const request = (endpoint, body, headers = {}) => fetch(root + endpoint, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  try {
    assert.equal((await request('/api/state')).status, 401)
    assert.equal((await request('/api/login', { email: 'unknown@example.com', password: 'incorrect' })).status, 401)
    const login = await request('/api/login', { demo: true })
    assert.equal(login.status, 200)
    cookie = login.headers.get('set-cookie').split(';')[0]
    assert.match(login.headers.get('set-cookie'), /HttpOnly/)
    const state = await (await request('/api/state')).json()
    assert.equal(state.students.length, 84)
    const action = { type: 'settings.save', settings: { ...state.settings, name: 'Persistent Test Library' } }
    assert.equal((await request('/api/actions', { revision: state.revision, action }, { Origin: 'https://untrusted.example' })).status, 403)
    assert.equal((await request('/api/actions', { revision: state.revision, action })).status, 200)
    assert.equal((await request('/api/actions', { revision: state.revision, action })).status, 409)
    assert.equal((await (await request('/api/state')).json()).settings.name, 'Persistent Test Library')
    const backup = await request('/api/backup')
    assert.equal(backup.status, 200)
    assert.equal((await backup.json()).settings.name, 'Persistent Test Library')
    assert.equal((await request('/api/logout', {})).status, 200)
    assert.equal((await request('/api/state')).status, 401)
  } finally { await new Promise(resolve => server.close(resolve)); db.close() }
  const reopened = createApp({ dbPath, demo: true })
  assert.equal(JSON.parse(reopened.db.prepare('SELECT data FROM library WHERE id=1').get().data).settings.name, 'Persistent Test Library')
  reopened.db.close()
  unlinkSync(dbPath)
  rmdirSync(dir)
})
test('real workspace rejects demo login and accepts configured owner credentials', async () => {
  const { app, db } = createApp({ dbPath: ':memory:', demo: false, password: 'test-only-password-123' })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  const login = body => fetch(`${root}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.equal((await login({ demo: true })).status, 401)
    assert.equal((await login({ email: process.env.ADMIN_EMAIL || 'owner@mslibrary.local', password: 'test-only-password-123' })).status, 200)
    assert.equal(JSON.parse(db.prepare('SELECT data FROM library WHERE id=1').get().data).students.length, 0)
  } finally { await new Promise(resolve => server.close(resolve)); db.close() }
})
