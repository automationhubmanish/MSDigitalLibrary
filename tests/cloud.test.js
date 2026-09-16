import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createCloudApp } from '../server/cloud/app.js'
import { createState } from '../server/domain.js'
import { readState, writeState, transaction } from '../server/cloud/database.js'

async function fixture() {
  const pg = new PGlite()
  await pg.exec(
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);',
  )
  await pg.exec(
    readFileSync(
      new URL('../supabase/migrations/202609160001_library.sql', import.meta.url),
      'utf8',
    ),
  )
  const query = async (sql, values) => {
    const r = await pg.query(sql, values)
    return { ...r, rowCount: r.affectedRows ?? r.rows.length }
  }
  let tail = Promise.resolve()
  const pool = {
    query,
    connect: async () => {
      const previous = tail
      let release
      tail = new Promise((r) => {
        release = r
      })
      await previous
      return { query, release }
    },
  }
  const state = createState(true)
  await transaction(pool, (client) => writeState(client, state))
  const ownerId = randomUUID(),
    studentId = randomUUID()
  await query('INSERT INTO auth.users VALUES($1,$2,$3::jsonb)', [
    ownerId,
    'owner@example.test',
    JSON.stringify({ user_id: 'owner', name: 'Owner', role: 'owner' }),
  ])
  // The Auth trigger always creates pending profiles, regardless of user metadata.
  assert.equal(
    (await query('SELECT role FROM public.profiles WHERE id=$1', [ownerId])).rows[0].role,
    'pending',
  )
  await query("UPDATE public.profiles SET role='owner' WHERE id=$1", [ownerId])
  await query('INSERT INTO auth.users VALUES($1,$2,$3::jsonb)', [
    studentId,
    'student@example.test',
    JSON.stringify({ user_id: 'student01', name: 'Student' }),
  ])
  await query("UPDATE public.profiles SET role='student',student_id='MSL-0084' WHERE id=$1", [
    studentId,
  ])
  const identity = {
    admin: {
      auth: {
        admin: {
          getUserById: async (id) => ({
            data: {
              user: (await query('SELECT id,email FROM auth.users WHERE id=$1', [id])).rows[0],
            },
          }),
        },
      },
    },
    publicClient: () => ({
      auth: {
        signInWithPassword: async ({ email, password }) => ({
          data: {
            user:
              password === 'cloud-test-password'
                ? (await query('SELECT id,email FROM auth.users WHERE email=$1', [email])).rows[0]
                : null,
          },
          error: password === 'cloud-test-password' ? null : new Error('Invalid password'),
        }),
        signUp: async ({ email, options }) => {
          const id = randomUUID()
          await query('INSERT INTO auth.users VALUES($1,$2,$3::jsonb)', [
            id,
            email,
            JSON.stringify(options.data),
          ])
          return { data: { user: { id, email, identities: [{}] }, session: null }, error: null }
        },
      },
    }),
  }
  const cloud = createCloudApp({
    pool,
    identity,
    secure: false,
    origin: 'http://127.0.0.1:3004',
    env: {},
    schedule: () => {},
  })
  const server = cloud.app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const root = `http://127.0.0.1:${server.address().port}`
  const request = (url, body, cookie = '', headers = {}) =>
    fetch(root + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const login = async (userId) => {
    const r = await request('/api/login', { userId, password: 'cloud-test-password' })
    assert.equal(r.status, 200)
    return r.headers.get('set-cookie').split(';')[0]
  }
  return {
    pg,
    pool,
    query,
    state,
    request,
    login,
    cloud,
    ownerId,
    studentId,
    close: async () => {
      await new Promise((r) => server.close(r))
      await pg.close()
    },
  }
}

test('Supabase schema round-trips records, protects browser roles, and applies atomic edits', async () => {
  const w = await fixture()
  try {
    assert.deepEqual(await readState(w.pool), w.state)
    assert.equal(
      (await w.query('SELECT count(*)::int AS count FROM public.seats')).rows[0].count,
      54,
    )
    await w.pg.exec('SET ROLE anon')
    await assert.rejects(w.query('SELECT * FROM public.students'), /permission denied/)
    await w.pg.exec('RESET ROLE; SET ROLE authenticated')
    await assert.rejects(w.query('SELECT * FROM public.cloud_sessions'), /permission denied/)
    await w.pg.exec('RESET ROLE')
    const owner = await w.login('owner')
    const action = {
      revision: w.state.revision,
      action: { type: 'settings.save', settings: { ...w.state.settings, name: 'Cloud Library' } },
    }
    assert.equal(
      (await w.request('/api/actions', action, owner, { Origin: 'https://untrusted.example' }))
        .status,
      403,
    )
    assert.equal((await w.request('/api/actions', action, owner)).status, 200)
    assert.equal((await w.request('/api/actions', action, owner)).status, 409)
    assert.equal((await readState(w.pool)).settings.name, 'Cloud Library')
    const before = await readState(w.pool)
    await assert.rejects(
      transaction(w.pool, async (client) => {
        const bad = structuredClone(before)
        bad.students[0].seat = 'Z-99'
        await writeState(client, bad)
      }),
      /foreign key/,
    )
    assert.deepEqual(await readState(w.pool), before)
  } finally {
    await w.close()
  }
})

test('cloud Supabase login, signup, roles and session revocation protect student records', async () => {
  const w = await fixture()
  try {
    const config = await (await w.request('/api/config')).json()
    assert.equal(config.demo, false)
    assert.equal(config.requiresEmail, true)
    assert.equal((await w.request('/api/login', { demo: true })).status, 401)
    const student = await w.login('student01'),
      owner = await w.login('owner')
    const state = await (
      await w.request('/api/state?studentId=MSL-0083', undefined, student)
    ).json()
    assert.deepEqual(
      state.students.map((s) => s.id),
      ['MSL-0084'],
    )
    assert.ok(state.payments.every((p) => p.studentId === 'MSL-0084'))
    assert.equal(state.layoutNotice, undefined)
    assert.equal((await w.request('/api/backup', undefined, student)).status, 403)
    assert.equal(
      (await w.request('/api/accounts/access', { userId: 'student01', role: 'owner' }, owner))
        .status,
      400,
    )
    assert.equal(
      (await w.request('/api/accounts/access', { userId: 'owner', role: 'disabled' }, owner))
        .status,
      400,
    )
    assert.equal(
      (
        await w.request('/api/signup', {
          userId: 'newstudent',
          name: 'New Student',
          password: 'cloud-test-password',
        })
      ).status,
      400,
    )
    const registration = await w.request('/api/signup', {
      userId: 'newstudent',
      name: 'New Student',
      email: 'new@example.test',
      password: 'cloud-test-password',
      role: 'owner',
    })
    assert.equal(registration.status, 201)
    assert.equal((await registration.json()).confirmEmail, true)
    const pending = await w.login('newstudent')
    assert.equal(
      (await (await w.request('/api/state', undefined, pending)).json()).students.length,
      0,
    )
    await w.request('/api/accounts/access', { userId: 'student01', role: 'disabled' }, owner)
    assert.equal((await w.request('/api/state', undefined, student)).status, 401)
    assert.equal(
      (await w.query('SELECT count(*)::int AS count FROM public.account_audit')).rows[0].count,
      1,
    )
  } finally {
    await w.close()
  }
})

test('cloud notification outbox persists and deduplicates simulated batches', async () => {
  const w = await fixture()
  try {
    const owner = await w.login('owner')
    const input = { requestId: randomUUID(), kind: 'fee' }
    const first = await (await w.request('/api/notifications/send', input, owner)).json()
    assert.equal(first.queued, 9)
    assert.equal(
      (await (await w.request('/api/notifications/send', input, owner)).json()).duplicate,
      true,
    )
    await w.cloud.notifications.process(10000)
    const result = await (await w.request('/api/notifications', undefined, owner)).json()
    assert.equal(result.history.length, 9)
    assert.ok(result.history.every((r) => r.status === 'simulated'))
    assert.equal(
      (
        await (
          await w.request('/api/notifications/send', { ...input, requestId: randomUUID() }, owner)
        ).json()
      ).queued,
      0,
    )
    assert.equal((await w.request('/api/cron/notifications')).status, 401)
  } finally {
    await w.close()
  }
})
