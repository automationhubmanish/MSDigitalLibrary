import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createPool, transaction, readState, writeState } from '../server/cloud/database.js'
import { identityClients } from '../server/cloud/identity.js'
import { createState } from '../server/domain.js'
import { migrateState } from '../server/configuration.js'

const owner = JSON.parse(readFileSync(new URL('../config/owner.json', import.meta.url), 'utf8'))
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
  throw new Error('Set the owner ADMIN_PASSWORD in .env to at least 12 characters.')
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(owner.userId) || !owner.email.includes('@'))
  throw new Error('Invalid owner configuration.')
const pool = createPool(),
  identity = identityClients()
try {
  await pool.query(
    readFileSync(
      new URL('../supabase/migrations/202609160001_library.sql', import.meta.url),
      'utf8',
    ),
  )
  const tables = (await pool.query('SELECT id FROM public.library WHERE id=1')).rows
  if (!tables.length) {
    const useLocal = process.argv.includes('--import-local')
    const local = useLocal
      ? new DatabaseSync(process.env.DATABASE_PATH || './data/library.sqlite', { readOnly: true })
      : null
    try {
      const original = local
        ? JSON.parse(local.prepare('SELECT data FROM library WHERE id=1').get().data)
        : createState(false)
      const state = migrateState(original)
      await transaction(pool, async (client) => {
        await writeState(client, state)
        if (local) {
          const names = local
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all()
            .map((t) => t.name)
          const batches = names.includes('notification_batches')
            ? local.prepare('SELECT * FROM notification_batches').all()
            : []
          for (const batch of batches)
            await client.query('INSERT INTO public.notification_batches VALUES($1,$2,$3,$4,$5)', [
              batch.id,
              batch.fingerprint,
              batch.created,
              batch.kind,
              batch.mode,
            ])
          if (names.includes('notification_items'))
            for (const item of local.prepare('SELECT * FROM notification_items').all()) {
              const batch = batches.find((b) => b.id === item.batch_id)
              await client.query(
                'INSERT INTO public.notification_items(id,batch_id,dedupe,status,data) VALUES($1,$2,$3,$4,$5::jsonb)',
                [
                  item.id,
                  item.batch_id,
                  item.dedupe,
                  item.status === 'sending' ? 'unknown' : item.status,
                  JSON.stringify({ ...JSON.parse(item.data), kind: batch.kind, mode: batch.mode }),
                ],
              )
            }
          if (names.includes('notification_drafts'))
            for (const draft of local.prepare('SELECT * FROM notification_drafts').all())
              await client.query('INSERT INTO public.notification_drafts VALUES($1,$2)', [
                draft.kind,
                draft.text,
              ])
          if (names.includes('accounts'))
            for (const account of local
              .prepare('SELECT user_id,name,role,student_id,created_at FROM accounts')
              .all())
              await client.query('INSERT INTO public.legacy_accounts VALUES($1,$2::jsonb)', [
                account.user_id,
                JSON.stringify(account),
              ])
        }
      })
      console.log(
        `Imported ${state.students.length} students, ${state.payments.length} payments and ${state.attendance.length} attendance records. Local source unchanged.`,
      )
      if (state.demo)
        console.log(
          'Sample-workspace flag preserved. Notifications will remain simulations until the sample dataset is replaced with verified real records.',
        )
    } finally {
      local?.close()
    }
  } else
    console.log('Cloud database already initialized; existing records will not be overwritten.')
  const existingOwner = (
    await pool.query(
      "SELECT id FROM public.profiles WHERE role='owner' ORDER BY created_at LIMIT 1",
    )
  ).rows[0]
  const existing =
    existingOwner ||
    (await pool.query('SELECT id FROM auth.users WHERE lower(email)=lower($1)', [owner.email]))
      .rows[0]
  const attributes = {
    email: owner.email,
    password: process.env.ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { user_id: owner.userId, name: owner.name },
  }
  const result = existing
    ? await identity.admin.auth.admin.updateUserById(existing.id, attributes)
    : await identity.admin.auth.admin.createUser(attributes)
  if (result.error)
    throw new Error(
      'Supabase owner creation/update failed. Verify the owner email, password and service key.',
    )
  const id = result.data.user.id
  await transaction(pool, async (client) => {
    await client.query(
      "UPDATE public.profiles SET user_id=$1,name=$2,role='owner',student_id=NULL,updated_at=now() WHERE id=$3",
      [owner.userId, owner.name, id],
    )
    await client.query('DELETE FROM public.cloud_sessions WHERE user_id=$1', [id])
  })
  const current = await readState(pool)
  console.log(
    `Supabase owner configured; cloud contains ${current.students.length} students. No password printed.`,
  )
} finally {
  await pool.end()
}
