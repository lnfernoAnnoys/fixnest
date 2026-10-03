/**
 * Looks at the welcome email without registering anyone.
 *
 *   npm run welcome-preview -w server                       writes welcome-preview.html here, to open in a browser
 *   npm run welcome-preview -w server -- you@example.com    also sends it to that address, using the real mail settings
 */
import fs from 'node:fs'
import { config } from './config.js'
import { welcomeEmail, welcomePreviewHtml } from './services/emailTemplates.js'
import { sendMail } from './services/mailer.js'

const sample = { name: 'Aarav Deshmukh', hostel: 'Mithila', room: 'M423', appUrl: config.appUrl }

fs.writeFileSync('welcome-preview.html', welcomePreviewHtml(sample))
console.log('Wrote welcome-preview.html (open it in a browser).')

const to = process.argv[2]
if (to) {
  if (!/^\S+@\S+\.\S+$/.test(to)) {
    console.error('That does not look like an email address.')
    process.exit(1)
  }
  if (!config.smtp) {
    console.error('SMTP_HOST is not set, so nothing can be sent. See the Email section of the README.')
    process.exit(1)
  }
  await sendMail({ to, ...welcomeEmail(sample) })
  console.log(`Sent the welcome email to ${to}. Check the inbox, and the spam folder.`)
}
