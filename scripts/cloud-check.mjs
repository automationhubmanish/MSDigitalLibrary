import { readFileSync } from 'node:fs'
const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'VERCEL_TOKEN',
]
const missing = required.filter((key) => !process.env[key])
console.log(
  missing.length
    ? `Missing deployment settings: ${missing.join(', ')}`
    : 'Deployment settings are present.',
)
const owner = JSON.parse(readFileSync(new URL('../config/owner.json', import.meta.url), 'utf8'))
console.log(
  `Owner configuration: ${owner.userId}; password length requirement: ${process.env.ADMIN_PASSWORD?.length >= 12 ? 'met' : 'not met'}.`,
)
if (missing.length || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
  process.exitCode = 1
