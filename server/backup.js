import { DatabaseSync, backup } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
const source = process.env.DATABASE_PATH || './data/library.sqlite'
const target = process.argv[2]
if (!target)
  throw new Error(
    'Usage: node --env-file-if-exists=.env server/backup.js path/to/new-backup.sqlite',
  )
if (!existsSync(source)) throw new Error('Source database does not exist.')
if (existsSync(target)) throw new Error('Backup target already exists. Choose a new filename.')
mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
const db = new DatabaseSync(source, { readOnly: true })
try {
  await backup(db, target)
  console.log(`Database backup saved to ${path.resolve(target)}`)
} finally {
  db.close()
}
