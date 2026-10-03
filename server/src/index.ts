import fs from 'node:fs'
import { createApp } from './app.js'
import { config } from './config.js'
import { ensureBaseData } from './db/baseData.js'
import { migrate } from './db/migrate.js'
import { startEmailWorker } from './services/emailQueue.js'

fs.mkdirSync(config.uploadDir, { recursive: true })
migrate()
ensureBaseData()

if (config.isProd && !config.smtp) {
  console.warn('[mail] SMTP is not configured: verification codes, password resets and email notifications cannot be sent.')
}
startEmailWorker()

const onListening = () => console.log(`FixNest API listening on http://localhost:${config.port}`)
const app = createApp()
if (config.host) app.listen(config.port, config.host, onListening)
else app.listen(config.port, onListening)
