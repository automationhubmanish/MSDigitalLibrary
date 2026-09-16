import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

export const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const tokenFrom = (req) =>
  (req.headers.cookie || '')
    .split('; ')
    .find((entry) => entry.startsWith('ms_session='))
    ?.slice(11) || ''
export const accountView = (row) => ({
  userId: row.user_id,
  name: row.name,
  role: row.role,
  studentId: row.student_id,
  createdAt: row.created_at,
})
export function identityClients(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Configure the Supabase URL, publishable/anon key and service/secret key.')
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
  return {
    admin: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options),
    publicClient: () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, options),
  }
}
export function cloudIdentity({ app, pool, identity, origin, secure = true }) {
  const cookie = {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  }
  const rateLimit = (scope, limit) => async (req, res, next) => {
    const now = Date.now(),
      bucket = Math.floor(now / 900000)
    const key = hash(`${scope}:${req.ip}:${bucket}`)
    await pool.query('DELETE FROM public.auth_limits WHERE expires < now()')
    const { rows } = await pool.query(
      'INSERT INTO public.auth_limits(key,hits,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=auth_limits.hits+1 RETURNING hits',
      [key, new Date((bucket + 1) * 900000)],
    )
    if (rows[0].hits > limit)
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
    next()
  }
  app.post('/api/signup', rateLimit('signup', 5), async (req, res) => {
    const parsed = z
      .object({
        userId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/),
        name: z.string().trim().min(2).max(80),
        email: z.email(),
        password: z.string().min(12).max(128),
      })
      .safeParse(req.body)
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: 'Enter a valid email, name, user ID and a password of at least 12 characters.',
        })
    const input = parsed.data,
      userId = normalize(input.userId)
    if ((await pool.query('SELECT id FROM public.profiles WHERE user_id=$1', [userId])).rows.length)
      return res.status(409).json({ error: 'That user ID is unavailable.' })
    const { data, error } = await identity
      .publicClient()
      .auth.signUp({
        email: normalize(input.email),
        password: input.password,
        options: { data: { user_id: userId, name: input.name }, emailRedirectTo: origin },
      })
    if (error || !data.user || data.user.identities?.length === 0)
      return res
        .status(400)
        .json({
          error:
            'Account could not be created. Check your details or sign in if you already registered.',
        })
    res.status(201).json({ userId, role: 'pending', confirmEmail: !data.session })
  })
  app.post('/api/login', rateLimit('login', 15), async (req, res) => {
    if (req.body.demo)
      return res.status(401).json({ error: 'Sign in with your owner or registered account.' })
    const userId = normalize(req.body.userId ?? req.body.email)
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (!userId || !password || password.length > 256)
      return res.status(401).json({ error: 'Incorrect user ID or password.' })
    let email = userId.includes('@') ? userId : ''
    if (!email) {
      const profile = (
        await pool.query('SELECT id FROM public.profiles WHERE user_id=$1', [userId])
      ).rows[0]
      if (profile) {
        const result = await identity.admin.auth.admin.getUserById(profile.id)
        email = result.data.user?.email || ''
      }
    }
    if (!email) return res.status(401).json({ error: 'Incorrect user ID or password.' })
    const { data, error } = await identity
      .publicClient()
      .auth.signInWithPassword({ email, password })
    if (error || !data.user)
      return res
        .status(401)
        .json({ error: 'Incorrect user ID or password, or email confirmation is pending.' })
    const profile = (await pool.query('SELECT * FROM public.profiles WHERE id=$1', [data.user.id]))
      .rows[0]
    if (!profile || profile.role === 'disabled')
      return res.status(401).json({ error: 'This account is not available.' })
    const token = randomBytes(32).toString('hex')
    await pool.query('DELETE FROM public.cloud_sessions WHERE token=$1 OR expires<now()', [
      hash(tokenFrom(req)),
    ])
    await pool.query('INSERT INTO public.cloud_sessions(token,user_id,expires) VALUES($1,$2,$3)', [
      hash(token),
      profile.id,
      new Date(Date.now() + cookie.maxAge),
    ])
    res.cookie('ms_session', token, cookie).json({ role: profile.role })
  })
  app.use('/api', async (req, res, next) => {
    const { rows } = await pool.query(
      'SELECT p.* FROM public.cloud_sessions s JOIN public.profiles p ON p.id=s.user_id WHERE s.token=$1 AND s.expires>now()',
      [hash(tokenFrom(req))],
    )
    if (!rows[0] || rows[0].role === 'disabled')
      return res.status(401).json({ error: 'Please sign in to continue.' })
    req.account = rows[0]
    req.role = rows[0].role
    next()
  })
  app.post('/api/logout', async (req, res) => {
    await pool.query('DELETE FROM public.cloud_sessions WHERE token=$1', [hash(tokenFrom(req))])
    res.clearCookie('ms_session', { ...cookie, maxAge: undefined }).json({ ok: true })
  })
}
