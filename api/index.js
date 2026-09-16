import { waitUntil, attachDatabasePool } from '@vercel/functions'
import { createCloudApp } from '../server/cloud/app.js'

let instance
export default function handler(req, res) {
  try {
    if (!instance) {
      instance = createCloudApp({ schedule: waitUntil })
      attachDatabasePool(instance.pool)
    }
    return instance.app(req, res)
  } catch {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'Deployment setup is incomplete. Configure Supabase and initialize the database.',
      }),
    )
  }
}
