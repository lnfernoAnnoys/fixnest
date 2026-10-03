import { config } from '../config.js'
import { db } from '../db/connection.js'

/**
 * Creates an in-app notification and, unless the person has turned emails off, queues it for email as well.
 * The email itself is sent in the background by services/emailQueue.ts, so callers stay fast and a slow or
 * failing mail server never breaks the action that caused the notification.
 *
 * Pass `{ email: false }` for messages that only make sense in the app (for example the receipt shown to
 * someone who just filed a complaint themselves).
 */
export function notify(userId: number, complaintId: number | null, title: string, body: string, opts: { email?: boolean } = {}) {
  const canEmail = (opts.email ?? true) && (config.smtp !== null || !config.isProd)
  const person = canEmail
    ? (db.prepare('SELECT email_notifications AS on_ FROM users WHERE id = ? AND active = 1 AND email_verified = 1').get(userId) as unknown as { on_: number } | undefined)
    : undefined
  const status = person?.on_ ? 'pending' : 'skipped'
  db.prepare('INSERT INTO notifications (user_id, complaint_id, title, body, email_status) VALUES (?,?,?,?,?)').run(userId, complaintId, title, body, status)
}

export function notifyAdmins(complaintId: number, title: string, body: string, exceptUserId?: number) {
  const admins = db.prepare("SELECT id FROM users WHERE role IN ('warden','admin') AND active=1").all() as unknown as { id: number }[]
  for (const a of admins) if (a.id !== exceptUserId) notify(a.id, complaintId, title, body)
}
