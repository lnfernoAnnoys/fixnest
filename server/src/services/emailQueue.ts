import { config } from '../config.js'
import { db } from '../db/connection.js'
import { sendMail } from './mailer.js'

/**
 * Sends the emails that notify() queued. Runs in the background every few seconds.
 * A failed send is retried later with a growing delay, and given up on after MAX_ATTEMPTS, so a mail-server
 * hiccup loses nothing and a permanent problem doesn't retry forever.
 */
const MAX_ATTEMPTS = 5
const BATCH = 10

interface Pending {
  id: number
  title: string
  body: string
  attempts: number
  email: string
  name: string
  code: string | null
}

function compose(n: Pending) {
  const first = n.name.split(/\s+/)[0]
  const lines = [`Hi ${first},`, '', n.body, '']
  if (n.code) lines.push(`View ${n.code}: ${config.appUrl}/complaints/${n.code}`, '')
  lines.push('--', 'You are getting this because email notifications are on for your FixNest account.', `Turn them off any time: ${config.appUrl}/settings`)
  return { to: n.email, subject: `[FixNest] ${n.title}`, text: lines.join('\n') }
}

let running = false

/** Sends whatever is due. Returns how many were sent and how many failed this round. */
export async function processEmailQueue(): Promise<{ sent: number; failed: number }> {
  if (running) return { sent: 0, failed: 0 }
  running = true
  let sent = 0
  let failed = 0
  try {
    const due = db
      .prepare(
        `SELECT n.id, n.title, n.body, n.email_attempts AS attempts, u.email, u.name, c.code
         FROM notifications n
         JOIN users u ON u.id = n.user_id
         LEFT JOIN complaints c ON c.id = n.complaint_id
         WHERE n.email_status = 'pending' AND (n.email_next_at IS NULL OR n.email_next_at <= ?)
         ORDER BY n.id LIMIT ?`,
      )
      .all(new Date().toISOString(), BATCH) as unknown as Pending[]

    for (const n of due) {
      try {
        await sendMail(compose(n))
        db.prepare("UPDATE notifications SET email_status = 'sent', emailed_at = ?, email_error = NULL WHERE id = ?").run(new Date().toISOString(), n.id)
        sent++
      } catch (e) {
        const attempts = n.attempts + 1
        const giveUp = attempts >= MAX_ATTEMPTS
        const retryAt = new Date(Date.now() + attempts * 2 * 60_000).toISOString() // 2, 4, 6, 8 minutes
        db.prepare('UPDATE notifications SET email_attempts = ?, email_status = ?, email_next_at = ?, email_error = ? WHERE id = ?').run(
          attempts,
          giveUp ? 'failed' : 'pending',
          giveUp ? null : retryAt,
          (e instanceof Error ? e.message : String(e)).slice(0, 200),
          n.id,
        )
        failed++
      }
    }
  } finally {
    running = false
  }
  return { sent, failed }
}

/** Starts the background sender. The timer never keeps the process alive on its own. */
export function startEmailWorker(intervalMs = 5000) {
  const timer = setInterval(() => {
    processEmailQueue().catch((e) => console.error('[email] queue error:', e))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
