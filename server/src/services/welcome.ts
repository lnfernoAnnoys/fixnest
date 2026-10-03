import { config } from '../config.js'
import { db } from '../db/connection.js'
import { welcomeEmail } from './emailTemplates.js'
import { sendMail } from './mailer.js'

/**
 * Sends a new student their welcome email, once. Call it whenever an account becomes usable (email verified, or a
 * Google sign-up finished). The "welcomed_at" stamp is claimed first, so two requests at once cannot send two emails,
 * and anyone who already had an account before this existed was marked as welcomed by the migration.
 * Sending runs in the background: a failure is logged and never blocks or breaks the sign-up.
 */
export function sendWelcomeIfNew(userId: number) {
  const claimed = db
    .prepare("UPDATE users SET welcomed_at = datetime('now') WHERE id = ? AND role = 'student' AND email_verified = 1 AND active = 1 AND welcomed_at IS NULL")
    .run(userId)
  if (Number(claimed.changes) !== 1) return

  const u = db
    .prepare(
      `SELECT u.name, u.email, h.name AS hostel, r.number AS room
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN hostels h ON h.id = sp.hostel_id
       LEFT JOIN rooms r ON r.id = sp.room_id
       WHERE u.id = ?`,
    )
    .get(userId) as unknown as { name: string; email: string; hostel: string | null; room: string | null }
  const mail = welcomeEmail({ name: u.name, hostel: u.hostel, room: u.room, appUrl: config.appUrl })
  void sendMail({ to: u.email, ...mail }).catch((e) => console.error('[mail] welcome email failed:', e instanceof Error ? e.message : e))
}
