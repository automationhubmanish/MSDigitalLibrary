import express from 'express'
import { createCloudApp } from './app.js'
const port = Number(process.env.CLOUD_PORT || 3003)
const { app } = createCloudApp({ origin: `http://127.0.0.1:${port}`, secure: false })
app.use(express.static('dist'))
app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: 'dist' }))
app.listen(port, '127.0.0.1', () =>
  console.log(`Cloud-backed preview ready on http://127.0.0.1:${port}`),
)
