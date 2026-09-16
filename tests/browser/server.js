import { createApp } from '../../server/index.js'
const { app, db } = createApp({ dbPath: ':memory:', demo: true, allowedOrigins: ['http://127.0.0.1:3002'] })
const server = app.listen(3002, '127.0.0.1')
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0) }))
