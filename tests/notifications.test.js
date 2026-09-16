import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/index.js'
import { createState, applyAction, today } from '../server/domain.js'
import { twilioProvider } from '../server/notifications.js'

test('restart resumes queued messages, preserves drafts, and does not retry interrupted sends', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ms-notifications-'))
  const dbPath = path.join(directory, 'library.sqlite')
  let calls = 0
  const notificationProvider = { channel: 'sms', ready: () => true, send: async () => { calls++; return { providerId: `SM${'a'.repeat(32)}`, status: 'accepted' } } }
  const options = { dbPath, demo: false, password: 'test-notification-password', notificationProvider }
  const initial = createApp(options)
  const state = createState(false)
  state.students = [1, 2].map((i) => ({ id: `s${i}`, name: `Student ${i}`, phone: `900000000${i}`, planId: '6h', monthlyFee: 400, startTime: '08:00', joined: today(), archivedAt: null }))
  initial.db.prepare('UPDATE library SET data=? WHERE id=1').run(JSON.stringify(state))
  initial.db.prepare('INSERT INTO notification_batches VALUES (?, ?, ?, ?, ?)').run('batch', 'fingerprint', new Date().toISOString(), 'announcement', 'live')
  for (const [index, student] of state.students.entries()) initial.db.prepare('INSERT INTO notification_items VALUES (?, ?, ?, ?, ?)').run(student.id, 'batch', student.id, index ? 'sending' : 'queued', JSON.stringify({ studentId: student.id, phone: student.phone, message: 'Saved notification', studentName: student.name, libraryName: state.settings.name }))
  initial.db.prepare('INSERT INTO notification_drafts VALUES (?, ?)').run('alert', 'Saved alert')
  initial.notifications.stop()
  await initial.notifications.idle()
  initial.db.close()
  const restarted = createApp(options)
  try {
    await restarted.notifications.idle()
    assert.equal(calls, 1)
    assert.deepEqual(restarted.db.prepare('SELECT status FROM notification_items ORDER BY id').all().map((row) => row.status), ['accepted', 'unknown'])
    assert.equal(restarted.notifications.snapshot().drafts[0].text, 'Saved alert')
  } finally {
    restarted.notifications.stop()
    await restarted.notifications.idle()
    restarted.db.close()
    unlinkSync(dbPath)
    rmdirSync(directory)
  }
})

async function workspace(demo, provider) {
  const instance = createApp({
    dbPath: ':memory:',
    demo,
    password: 'test-notification-password',
    notificationProvider: provider,
  })
  const server = instance.app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  let cookie = ''
  const request = (url, body) =>
    fetch(root + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const response = await request(
    '/api/login',
    demo
      ? { demo: true }
      : {
          email: process.env.ADMIN_EMAIL || 'owner@mslibrary.local',
          password: 'test-notification-password',
        },
  )
  cookie = response.headers.get('set-cookie').split(';')[0]
  return {
    ...instance,
    request,
    async close() {
      instance.notifications.stop()
      await instance.notifications.idle()
      await new Promise((resolve) => server.close(resolve))
      instance.db.close()
    },
  }
}

test('demo sends are simulated, exclude paid/archived students, and deduplicate repeated requests', async () => {
  let calls = 0
  const w = await workspace(true, {
    channel: 'whatsapp',
    ready: () => true,
    send: async () => {
      calls++
      throw Error('Demo must not contact provider')
    },
  })
  try {
    const state = await (await w.request('/api/state')).json()
    const due = state.students.filter(
      (s) =>
        !s.archivedAt &&
        !state.payments.some(
          (p) => p.studentId === s.id && p.month === today().slice(0, 7) && !p.voided,
        ),
    )
    const input = { requestId: randomUUID(), kind: 'fee' }
    assert.equal(
      (await (await w.request('/api/notifications/send', input)).json()).queued,
      due.length,
    )
    await w.notifications.idle()
    assert.equal((await (await w.request('/api/notifications/send', input)).json()).duplicate, true)
    assert.equal(
      (
        await (
          await w.request('/api/notifications/send', { ...input, requestId: randomUUID() })
        ).json()
      ).queued,
      0,
    )
    const output = await (await w.request('/api/notifications')).json()
    assert.equal(output.history.length, due.length)
    assert.ok(
      output.history.every(
        (item) => item.status === 'simulated' && !item.message.includes('{name}'),
      ),
    )
    assert.equal(calls, 0)
    assert.equal(
      (
        await w.request('/api/notifications/send', {
          ...input,
          kind: 'alert',
          text: 'Different request',
        })
      ).status,
      409,
    )
    assert.equal(
      (
        await w.request('/api/notifications/send', {
          requestId: randomUUID(),
          kind: 'alert',
          text: '',
        })
      ).status,
      400,
    )
    await w.request('/api/notifications/draft', {
      kind: 'announcement',
      text: 'Library opens at 7 AM.',
    })
    assert.equal(
      (await (await w.request('/api/notifications')).json()).drafts.announcement,
      'Library opens at 7 AM.',
    )
    w.db.prepare("UPDATE sessions SET role='staff'").run()
    assert.equal(
      (
        await w.request('/api/notifications/send', {
          requestId: randomUUID(),
          kind: 'alert',
          text: 'Closed today',
        })
      ).status,
      403,
    )
    assert.equal(
      (await w.request('/api/notifications/draft', { kind: 'alert', text: 'Closed' })).status,
      403,
    )
  } finally {
    await w.close()
  }
})

test('live broadcasts record accepted and uncertain outcomes without automatic retries', async () => {
  let calls = 0
  const w = await workspace(false, {
    channel: 'whatsapp',
    ready: () => true,
    send: async () => {
      calls++
      if (calls === 2) throw Object.assign(Error('Timeout'), { uncertain: true })
      return { providerId: `SM${'a'.repeat(32)}`, status: 'accepted' }
    },
  })
  try {
    const state = createState(false)
    state.students = [1, 2, 3].map((i) => ({
      id: `s${i}`,
      name: `Student ${i}`,
      phone: `900000000${i}`,
      planId: '6h',
      monthlyFee: 400,
      startTime: '08:00',
      joined: today(),
      archivedAt: i === 3 ? today() : null,
    }))
    w.db.prepare('UPDATE library SET data=? WHERE id=1').run(JSON.stringify(state))
    const request = {
      requestId: randomUUID(),
      kind: 'announcement',
      text: 'Library opens at 7 AM tomorrow.',
    }
    assert.equal((await (await w.request('/api/notifications/send', request)).json()).queued, 2)
    await w.notifications.idle()
    const history = (await (await w.request('/api/notifications')).json()).history
    assert.deepEqual(history.map((i) => i.status).sort(), ['accepted', 'unknown'])
    await w.request('/api/notifications/send', { ...request, requestId: randomUUID() })
    await w.notifications.idle()
    assert.equal(calls, 2)
  } finally {
    await w.close()
  }
})

test('live sending requires provider configuration and keeps secrets out of status API', async () => {
  const w = await workspace(false, twilioProvider({}))
  try {
    assert.equal(
      (await w.request('/api/notifications/send', { requestId: randomUUID(), kind: 'fee' })).status,
      503,
    )
    const config = await (await w.request('/api/notifications')).json()
    assert.deepEqual(config.ready, { fee: false, announcement: false, alert: false })
    assert.ok(!JSON.stringify(config).includes('AUTH_TOKEN'))
  } finally {
    await w.close()
  }
})

test('WhatsApp uses configured Content template and correct Indian phone formatting', async () => {
  let form
  const provider = twilioProvider(
    {
      NOTIFICATIONS_ENABLED: 'true',
      TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'test-only-token',
      TWILIO_FROM: '+14155551234',
      TWILIO_FEE_TEMPLATE_SID: `HX${'b'.repeat(32)}`,
    },
    async (url, options) => {
      assert.ok(url.startsWith('https://api.twilio.com/2010-04-01/Accounts/AC'))
      form = options.body
      return new Response(JSON.stringify({ sid: `SM${'c'.repeat(32)}`, status: 'queued' }), {
        status: 201,
      })
    },
  )
  assert.equal(provider.ready('fee'), true)
  assert.equal(provider.ready('alert'), false)
  const result = await provider.send({
    kind: 'fee',
    phone: '9876543210',
    studentName: 'Test',
    libraryName: 'Library',
    message: 'Pay your monthly fee.',
  })
  assert.equal(result.status, 'accepted')
  assert.equal(form.get('To'), 'whatsapp:+919876543210')
  assert.equal(form.get('From'), 'whatsapp:+14155551234')
  assert.equal(JSON.parse(form.get('ContentVariables'))['3'], 'Pay your monthly fee.')
  assert.equal(form.has('Body'), false)
})

test('daily hours are configurable within plan limits and opening-day closure is saved', () => {
  let state = createState(false)
  const student = {
    name: 'Test Student',
    phone: '9876543210',
    planId: '6h',
    seat: 'A-01',
    startTime: '18:00',
    dailyHours: 4.5,
    joined: today(),
    notes: '',
  }
  state = applyAction(state, { type: 'student.save', student }, 'owner')
  assert.equal(state.students[0].dailyHours, 4.5)
  assert.throws(
    () =>
      applyAction(
        state,
        { type: 'student.save', id: state.students[0].id, student: { ...student, dailyHours: 7 } },
        'owner',
      ),
    /cannot exceed/,
  )
  assert.throws(
    () =>
      applyAction(
        state,
        {
          type: 'student.save',
          id: state.students[0].id,
          student: { ...student, startTime: '23:00' },
        },
        'owner',
      ),
    /midnight/,
  )
  assert.throws(
    () =>
      applyAction(
        state,
        { type: 'plan.save', id: '6h', plan: { ...state.plans[0], hours: 4 } },
        'owner',
      ),
    /daily hours/,
  )
  state = applyAction(
    state,
    { type: 'settings.save', settings: { ...state.settings, sundayClosed: true } },
    'owner',
  )
  assert.equal(state.settings.sundayClosed, true)
  state = applyAction(
    state,
    { type: 'student.save', id: state.students[0].id, student: { ...student, dailyHours: null } },
    'owner',
  )
  assert.equal(state.students[0].dailyHours, null)
})
