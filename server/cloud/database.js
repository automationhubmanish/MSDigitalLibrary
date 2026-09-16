import pg from 'pg'
import { getSeats } from '../configuration.js'

export function createPool(env = process.env) {
  if (!env.SUPABASE_DB_URL)
    throw new Error('Set SUPABASE_DB_URL to the Supabase pooler connection string.')
  const url = new URL(env.SUPABASE_DB_URL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Invalid database connection protocol.')
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key)
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(env.SUPABASE_DB_CA ? { ca: env.SUPABASE_DB_CA.replaceAll('\\n', '\n') } : {}),
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  })
}
export async function transaction(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
export async function readState(db, lock = false) {
  if (lock) await db.query('SELECT id FROM public.library WHERE id=1 FOR UPDATE')
  const { rows } = await db.query(`SELECT meta,
    (SELECT coalesce(jsonb_agg(data ORDER BY position),'[]'::jsonb) FROM public.plans) AS plans,
    (SELECT coalesce(jsonb_agg(data ORDER BY position),'[]'::jsonb) FROM public.students) AS students,
    (SELECT coalesce(jsonb_agg(data ORDER BY position),'[]'::jsonb) FROM public.payments) AS payments,
    (SELECT coalesce(jsonb_agg(data ORDER BY position),'[]'::jsonb) FROM public.attendance) AS attendance
    FROM public.library WHERE id=1`)
  if (!rows[0])
    throw Object.assign(
      new Error('Cloud database needs initialization. Run npm run cloud:setup.'),
      { status: 503 },
    )
  const { meta, ...collections } = rows[0]
  return { ...meta, ...collections }
}
export async function writeState(db, state) {
  const { plans, students, payments, attendance, ...meta } = state
  const seatRows = getSeats(state.settings).map((id) => ({
    id,
    row: id.split('-')[0],
    number: Number(id.split('-')[1]),
  }))
  await db.query(
    `INSERT INTO public.seats(id,row_label,seat_number) SELECT x->>'id',x->>'row',(x->>'number')::integer FROM jsonb_array_elements($1::jsonb) x ON CONFLICT(id) DO NOTHING`,
    [JSON.stringify(seatRows)],
  )
  for (const [table, records] of Object.entries({ plans, students, payments, attendance })) {
    await db.query(
      `INSERT INTO public.${table}(id,position,data) SELECT x->>'id',ordinality::integer,x FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS a(x,ordinality) ON CONFLICT(id) DO UPDATE SET position=excluded.position,data=excluded.data`,
      [JSON.stringify(records)],
    )
  }
  for (const [table, records] of Object.entries({ attendance, payments, students, plans }))
    await db.query(`DELETE FROM public.${table} WHERE NOT(id = ANY($1::text[]))`, [
      records.map((record) => record.id),
    ])
  await db.query('DELETE FROM public.seats WHERE NOT(id = ANY($1::text[]))', [
    seatRows.map((seat) => seat.id),
  ])
  await db.query(
    'INSERT INTO public.library(id,meta) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET meta=excluded.meta',
    [JSON.stringify(meta)],
  )
}
