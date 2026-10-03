import { config } from '../config.js'
import { db } from '../db/connection.js'
import { HttpError } from '../lib/errors.js'
import { randomCode, safeEqual, sha256 } from '../lib/security.js'
import { sendMail } from './mailer.js'

interface VerificationRow {
  code_hash: string
  expires_at: string
  attempts: number
  sent_at: string
}

/** Creates a fresh 6-digit code for the user and emails it. Enforces a resend cooldown. */
export async function issueCode(userId: number, email: string) {
  const row = db.prepare('SELECT sent_at FROM email_verifications WHERE user_id=?').get(userId) as
    | { sent_at: string }
    | undefined
  if (row) {
    const waitMs = config.verification.resendSeconds * 1000 - (Date.now() - Date.parse(row.sent_at))
    if (waitMs > 0) {
      throw new HttpError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`, 'COOLDOWN')
    }
  }
  const code = randomCode()
  const now = Date.now()
  db.prepare(
    `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, sent_at)
     VALUES (?,?,?,0,?)
     ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at,
       attempts=0, sent_at=excluded.sent_at`,
  ).run(userId, sha256(code), new Date(now + config.verification.ttlMinutes * 60_000).toISOString(), new Date(now).toISOString())
  await sendMail({
    to: email,
    subject: 'Your FixNest verification code',
    text: `Your FixNest verification code is ${code}. It expires in ${config.verification.ttlMinutes} minutes.`,
  })
}

/** Checks a submitted code. Returns true on success and consumes it. */
export function checkCode(userId: number, code: string): boolean {
  const row = db.prepare('SELECT * FROM email_verifications WHERE user_id=?').get(userId) as unknown as VerificationRow | undefined
  if (!row) throw new HttpError(400, 'No code was requested. Ask for a new one.', 'NO_CODE')
  if (row.attempts >= config.verification.maxAttempts) {
    throw new HttpError(429, 'Too many wrong attempts. Ask for a new code.', 'TOO_MANY_ATTEMPTS')
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    throw new HttpError(400, 'That code has expired. Ask for a new one.', 'CODE_EXPIRED')
  }
  if (!safeEqual(sha256(code), row.code_hash)) {
    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id=?').run(userId)
    return false
  }
  db.prepare('DELETE FROM email_verifications WHERE user_id=?').run(userId)
  return true
}
