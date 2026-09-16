import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'

const password = 'test-account-password-123'
async function start(dbPath = ':memory:') {
  const instance = createApp({ dbPath, demo: true, password })
  const server = instance.app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  const request = (url, body, cookie = '') =>
    fetch(root + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const login = async (body) => {
    const response = await request('/api/login', body)
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  return {
    ...instance,
    request,
    login,
    async close() {
      instance.notifications.stop()
      await instance.notifications.idle()
      await new Promise((resolve) => server.close(resolve))
      instance.db.close()
    },
  }
}

test('signup validates unique IDs, hashes passwords, and cannot self-grant management access', async () => {
  const w = await start()
  try {
    const signup = {
      userId: 'New.Student',
      name: 'New Student',
      password,
      role: 'owner',
      studentId: 'MSL-0084',
    }
    const response = await w.request('/api/signup', signup)
    assert.equal(response.status, 201)
    assert.equal((await response.json()).role, 'pending')
    const account = w.db.prepare('SELECT * FROM accounts').get()
    assert.equal(account.user_id, 'new.student')
    assert.equal(account.role, 'pending')
    assert.equal(account.student_id, null)
    assert.ok(!JSON.stringify(account).includes(password))
    assert.equal((await w.request('/api/signup', { ...signup, userId: 'NEW.STUDENT' })).status, 409)
    assert.equal((await w.request('/api/signup', { ...signup, userId: 'owner' })).status, 409)
    assert.equal(
      (await w.request('/api/signup', { ...signup, userId: 'other', password: 'short' })).status,
      400,
    )
    assert.equal(
      (await w.request('/api/login', { userId: 'new.student', password: 'wrong' })).status,
      401,
    )
    const cookie = await w.login({ userId: 'NEW.STUDENT', password })
    const state = await (await w.request('/api/state', undefined, cookie)).json()
    assert.equal(state.role, 'pending')
    assert.equal(state.students.length, 0)
    assert.equal(state.payments.length, 0)
    for (const endpoint of ['/api/backup', '/api/accounts', '/api/notifications'])
      assert.equal((await w.request(endpoint, undefined, cookie)).status, 403)
    assert.equal(
      (
        await w.request(
          '/api/actions',
          { revision: 0, action: { type: 'student.archive', id: 'MSL-0084' } },
          cookie,
        )
      ).status,
      403,
    )
  } finally {
    await w.close()
  }
})

test('owner links a student; projections protect other records; access changes revoke sessions', async () => {
  const w = await start()
  try {
    await w.request('/api/signup', { userId: 'student01', name: 'Test Student', password })
    const pending = await w.login({ userId: 'student01', password })
    const owner = await w.login({ userId: process.env.ADMIN_USER_ID || 'owner', password })
    assert.equal(
      (await w.request('/api/accounts/access', { userId: 'student01', role: 'owner' }, owner))
        .status,
      400,
    )
    assert.equal(
      (
        await w.request(
          '/api/accounts/access',
          { userId: 'student01', role: 'student', studentId: 'MSL-0084' },
          owner,
        )
      ).status,
      200,
    )
    assert.equal((await w.request('/api/state', undefined, pending)).status, 401)
    const student = await w.login({ userId: 'student01', password })
    const state = await (
      await w.request('/api/state?studentId=MSL-0083', undefined, student)
    ).json()
    assert.equal(state.role, 'student')
    assert.deepEqual(
      state.students.map((s) => s.id),
      ['MSL-0084'],
    )
    assert.equal(state.students[0].notes, '')
    assert.ok(state.payments.every((p) => p.studentId === 'MSL-0084'))
    assert.ok(state.attendance.every((a) => a.studentId === 'MSL-0084'))
    assert.deepEqual(state.audit, [])
    assert.equal(
      (await w.request('/api/accounts/access', { userId: 'student01', role: 'staff' }, student))
        .status,
      403,
    )
    assert.equal((await w.request('/api/notifications/send', { kind: 'fee' }, student)).status, 403)
    const accounts = await (await w.request('/api/accounts', undefined, owner)).json()
    assert.ok(!JSON.stringify(accounts).includes('password_hash'))
    assert.ok(!JSON.stringify(accounts).includes('salt'))
    await w.request('/api/accounts/access', { userId: 'student01', role: 'staff' }, owner)
    const staff = await w.login({ userId: 'student01', password })
    assert.equal((await (await w.request('/api/state', undefined, staff)).json()).role, 'staff')
    assert.equal((await w.request('/api/accounts', undefined, staff)).status, 403)
    await w.request('/api/accounts/access', { userId: 'student01', role: 'disabled' }, owner)
    assert.equal((await w.request('/api/state', undefined, staff)).status, 401)
    assert.equal((await w.request('/api/login', { userId: 'student01', password })).status, 401)
  } finally {
    await w.close()
  }
})

test('registered login survives restart and account salts are independent', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ms-accounts-'))
  const file = path.join(dir, 'library.sqlite')
  const initial = await start(file)
  await initial.request('/api/signup', { userId: 'persistent01', name: 'Persistent One', password })
  await initial.request('/api/signup', { userId: 'persistent02', name: 'Persistent Two', password })
  const accounts = initial.db.prepare('SELECT salt, password_hash FROM accounts').all()
  assert.notEqual(accounts[0].salt, accounts[1].salt)
  assert.notEqual(accounts[0].password_hash, accounts[1].password_hash)
  await initial.close()
  const reopened = await start(file)
  try {
    await reopened.login({ userId: 'persistent01', password })
  } finally {
    await reopened.close()
    unlinkSync(file)
    rmdirSync(dir)
  }
})
