/**
 * Sends one test email with the settings in server/.env, so you can check them before anyone signs up.
 * Usage:  npm run test-mail -w server -- you@example.com
 */
import { config } from './config.js'
import { sendMail } from './services/mailer.js'

const to = process.argv[2]
if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
  console.error('Usage: npm run test-mail -w server -- you@example.com')
  process.exit(1)
}
if (!config.smtp) {
  console.error('SMTP_HOST is not set in server/.env, so nothing can be sent yet. See the Email section of the README.')
  process.exit(1)
}

const { host, port, user } = config.smtp
console.log(`Sending a test email to ${to} through ${host}:${port}${user ? ` as ${user}` : ' (no login)'} ...`)
try {
  await sendMail({
    to,
    subject: '[FixNest] Test email',
    text: 'If you can read this, FixNest can send email. Sign-up codes, password resets and notifications will reach people.',
  })
  console.log('Sent. Check the inbox, and the spam folder if it is not there.')
} catch {
  console.error('The email was not sent. The reason is printed above, after "[mail] SMTP send failed".')
  process.exit(1)
}
