import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { config } from '../config.js'
import { db, tx } from '../db/connection.js'
import { conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/security.js'
import { parse } from '../lib/validate.js'
import { COOKIE, requireAuth, setSessionCookie, type Role } from '../middleware/auth.js'
import { safePicture, verifyGoogleCredential } from '../services/google.js'
import { cleanHostelName, cleanRoomNumber, finalizeStudentLocation, resolveLocation } from '../services/location.js'
import { avatarUrlFor, nextRoomChangeAt } from '../services/profile.js'
import { sendWelcomeIfNew } from '../services/welcome.js'
import { assertNotLocked, clearFailures, recordFailure } from '../services/loginGuard.js'
import { endSession, listSessions, revokeOtherSessions, revokeSession } from '../services/sessions.js'
import { sendMail } from '../services/mailer.js'
import { checkCode, issueCode } from '../services/verification.js'

const router = Router()

router.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: config.rateLimit.auth,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMIT' },
  }),
)

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .pipe(z.email('Enter a valid email address'))
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters')
const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email,
  password,
  /** What the student typed. (An existing hostel and room can also be given by id.) */
  hostelName: z.string().max(60).optional(),
  roomNumber: z.string().max(20).optional(),
  hostelId: z.number().int().positive().optional(),
  roomId: z.number().int().positive().optional(),
  enrollmentNo: z.string().trim().max(30).optional(),
})

interface UserRow {
  id: number
  name: string
  email: string
  password_hash: string
  role: Role
  active: number
  email_verified: number
}

const findByEmail = (e: string) => db.prepare('SELECT * FROM users WHERE email=?').get(e) as unknown as UserRow | undefined

export function publicUser(id: number) {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.avatar_url AS googleAvatar, u.avatar_path AS avatarPath,
              (u.google_sub IS NOT NULL) AS googleLinked,
              u.email_notifications AS emailNotifications,
              sp.enrollment_no AS enrollmentNo, sp.location_changed_at AS locationChangedAt,
              h.id AS hostelId, h.name AS hostelName, r.id AS roomId, r.number AS roomNumber, r.floor AS floor
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN hostels h ON h.id = sp.hostel_id
       LEFT JOIN rooms r ON r.id = sp.room_id
       WHERE u.id=?`,
    )
    .get(id) as unknown as ({ googleAvatar: string | null; avatarPath: string | null; locationChangedAt: string | null } & Record<string, unknown>) | undefined
  if (!row) return undefined
  const { googleAvatar, avatarPath, locationChangedAt, ...u } = row
  return {
    ...u,
    avatarUrl: avatarUrlFor(Number(u.id), avatarPath, googleAvatar),
    customAvatar: avatarPath !== null,
    /** ISO time a student may next change hostel/room; null when they can do it now. */
    roomChangeAllowedAt: nextRoomChangeAt(locationChangedAt),
  }
}

router.post('/register', async (req, res) => {
  const body = parse(registerSchema, req.body)
  const domain = body.email.split('@')[1]
  if (!config.studentEmailDomains.includes(domain)) {
    throw new HttpError(
      400,
      `Sign up with your college email (@${config.studentEmailDomains[0]}).`,
      'EMAIL_DOMAIN',
    )
  }
  // A typed hostel and room are only checked for now; they join the lists once the email is verified.
  const typed = body.hostelName !== undefined && body.roomNumber !== undefined
  const pending = typed ? { hostel: cleanHostelName(body.hostelName!), room: cleanRoomNumber(body.roomNumber!) } : null
  const known = typed ? null : resolveLocation({ hostelId: body.hostelId, roomId: body.roomId })

  const existing = findByEmail(body.email)
  if (existing && (existing.email_verified || existing.role !== 'student')) {
    throw conflict('An account with this email already exists. Log in instead.', 'EMAIL_TAKEN')
  }

  const passwordHash = await hashPassword(body.password)
  const userId = tx(() => {
    let id: number
    if (existing) {
      // Unverified signup being retried: refresh the details.
      id = existing.id
      db.prepare('UPDATE users SET name=?, password_hash=? WHERE id=?').run(body.name, passwordHash, id)
      db.prepare('UPDATE student_profiles SET hostel_id=?, room_id=?, pending_hostel=?, pending_room=?, enrollment_no=? WHERE user_id=?').run(
        known?.hostelId ?? null, known?.roomId ?? null, pending?.hostel ?? null, pending?.room ?? null, body.enrollmentNo ?? null, id,
      )
    } else {
      id = Number(
        db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'student')").run(body.name, body.email, passwordHash)
          .lastInsertRowid,
      )
      db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id,pending_hostel,pending_room,enrollment_no) VALUES (?,?,?,?,?,?)').run(
        id, known?.hostelId ?? null, known?.roomId ?? null, pending?.hostel ?? null, pending?.room ?? null, body.enrollmentNo ?? null,
      )
    }
    return id
  })
  await issueCode(userId, body.email)
  res.status(201).json({ needsVerification: true, email: body.email })
})

router.post('/verify-email', (req, res) => {
  const body = parse(z.object({ email, code }), req.body)
  const user = findByEmail(body.email)
  if (!user || user.email_verified) throw new HttpError(400, 'That code is not valid.', 'BAD_CODE')
  if (!checkCode(user.id, body.code)) throw new HttpError(400, 'That code is not correct.', 'BAD_CODE')
  tx(() => {
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id)
    finalizeStudentLocation(user.id)
  })
  sendWelcomeIfNew(user.id)
  setSessionCookie(req, res, user.id)
  res.json({ user: publicUser(user.id) })
})

router.post('/resend-code', async (req, res) => {
  const body = parse(z.object({ email }), req.body)
  const user = findByEmail(body.email)
  // Same response whether or not the account exists, so this can't be used to probe emails.
  if (user && !user.email_verified && user.active) await issueCode(user.id, user.email)
  res.json({ ok: true })
})

router.post('/login', async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body)
  assertNotLocked(body.email)
  const user = findByEmail(body.email)
  const ok = await verifyPassword(body.password, user?.password_hash)
  if (!user || !ok) {
    recordFailure(body.email)
    throw new HttpError(401, 'Incorrect email or password.', 'BAD_CREDENTIALS')
  }
  clearFailures(body.email)
  if (!user.active) throw forbidden('This account has been deactivated. Contact the hostel office.')
  if (!user.email_verified) {
    try {
      await issueCode(user.id, user.email)
    } catch (e) {
      if (!(e instanceof HttpError && e.code === 'COOLDOWN')) throw e
    }
    throw new HttpError(403, 'Verify your email to continue. We sent you a code.', 'EMAIL_NOT_VERIFIED')
  }
  setSessionCookie(req, res, user.id)
  res.json({ user: publicUser(user.id) })
})

// ---- Google sign-in ----------------------------------------------------------------------------
// Existing accounts (students, staff, admins) can log in with the Google account that has the same
// verified email. Brand-new accounts can only be created for student-domain emails, and only students.

/** Tells the client whether to show the Google button (the client id is a public value). */
router.get('/providers', (_req, res) => {
  res.json({ google: config.googleClientId ? { clientId: config.googleClientId } : null })
})

interface GoogleUserRow extends UserRow {
  google_sub: string | null
}

const SIGNUP_KIND = 'google-signup'

router.post('/google', async (req, res) => {
  const { credential } = parse(z.object({ credential: z.string().min(20).max(4096) }), req.body)
  const g = await verifyGoogleCredential(credential)

  const user = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(g.sub, g.email) as unknown as
    | GoogleUserRow
    | undefined

  if (user) {
    if (!user.active) throw forbidden('This account has been deactivated. Contact the hostel office.')
    // A Google account is bound to one user; never let a different Google account take over this email.
    if (user.google_sub && user.google_sub !== g.sub) {
      throw forbidden('This email is linked to a different Google account.')
    }
    if (!user.google_sub || !user.email_verified) {
      // Google just proved ownership of this email. If the account was created but never verified,
      // someone else may have picked its password, so replace it with an unguessable one.
      const scrub = user.email_verified ? null : await hashPassword(randomToken(24))
      tx(() => {
        db.prepare('UPDATE users SET google_sub = ?, email_verified = 1, password_hash = COALESCE(?, password_hash) WHERE id = ?').run(g.sub, scrub, user.id)
        finalizeStudentLocation(user.id)
      })
      sendWelcomeIfNew(user.id)
    }
    if (g.picture) db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(g.picture, user.id)
    setSessionCookie(req, res, user.id)
    res.json({ user: publicUser(user.id) })
    return
  }

  if (!config.studentEmailDomains.includes(g.email.split('@')[1])) {
    throw forbidden(`Sign in with your college email (@${config.studentEmailDomains[0]}), or ask the hostel office to add your account.`)
  }
  // New student: we still need their hostel and room. Hand back a short-lived proof of the Google identity.
  const signupToken = jwt.sign({ kind: SIGNUP_KIND, gsub: g.sub, email: g.email, name: g.name, pic: g.picture }, config.jwtSecret, { expiresIn: '15m' })
  res.json({ needsProfile: true, signupToken, name: g.name, email: g.email, picture: g.picture })
})

router.post('/google/complete', async (req, res) => {
  const body = parse(
    z.object({
      signupToken: z.string().min(20).max(2048),
      hostelName: z.string().max(60).optional(),
      roomNumber: z.string().max(20).optional(),
      hostelId: z.number().int().positive().optional(),
      roomId: z.number().int().positive().optional(),
    }),
    req.body,
  )
  let claims: { kind?: string; gsub?: string; email?: string; name?: string; pic?: string | null }
  try {
    claims = jwt.verify(body.signupToken, config.jwtSecret) as typeof claims
  } catch {
    throw new HttpError(400, 'That sign-up session expired. Please sign in with Google again.', 'SIGNUP_EXPIRED')
  }
  if (claims.kind !== SIGNUP_KIND || !claims.gsub || !claims.email || !claims.name) {
    throw new HttpError(400, 'That sign-up session is not valid.', 'SIGNUP_EXPIRED')
  }
  if (!config.studentEmailDomains.includes(claims.email.split('@')[1])) throw forbidden()
  if (db.prepare('SELECT 1 FROM users WHERE email = ? OR google_sub = ?').get(claims.email, claims.gsub)) {
    throw conflict('An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN')
  }

  // Google accounts have no password of their own; store an unguessable one.
  const passwordHash = await hashPassword(randomToken(24))
  const userId = tx(() => {
    const id = Number(
      db
        .prepare("INSERT INTO users (name,email,password_hash,role,email_verified,google_sub,avatar_url) VALUES (?,?,?,'student',1,?,?)")
        .run(claims.name!, claims.email!, passwordHash, claims.gsub!, safePicture(claims.pic)).lastInsertRowid,
    )
    const where = resolveLocation(body)
    db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(id, where.hostelId, where.roomId)
    return id
  })
  sendWelcomeIfNew(userId)
  setSessionCookie(req, res, userId)
  res.status(201).json({ user: publicUser(userId) })
})

/** A signed-in user connects the Google account that has the same email as their FixNest account. */
router.post('/google/link', requireAuth, async (req, res) => {
  const { credential } = parse(z.object({ credential: z.string().min(20).max(4096) }), req.body)
  const g = await verifyGoogleCredential(credential)
  const me = db.prepare('SELECT id, email, google_sub FROM users WHERE id = ?').get(req.user!.id) as unknown as {
    id: number
    email: string
    google_sub: string | null
  }
  if (g.email !== me.email) {
    throw new HttpError(400, `Use the Google account for ${me.email}. You picked ${g.email}.`, 'GOOGLE_EMAIL_MISMATCH')
  }
  if (me.google_sub && me.google_sub !== g.sub) throw conflict('A different Google account is already connected.', 'GOOGLE_ALREADY_LINKED')
  if (db.prepare('SELECT 1 FROM users WHERE google_sub = ? AND id <> ?').get(g.sub, me.id)) {
    throw conflict('That Google account is connected to another FixNest account.', 'GOOGLE_IN_USE')
  }
  db.prepare('UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?').run(g.sub, g.picture, me.id)
  res.json({ user: publicUser(me.id) })
})

// ---- forgot password -----------------------------------------------------------------------------------
// The emailed link carries a random one-time token in the part after "#", which browsers never send to servers
// or to other sites. Only a hash of the token is stored, so a copy of the database can't be used to reset anyone.

const RESET_TTL_MINUTES = 30
const RESET_COOLDOWN_MS = 60_000
const resetToken = z.string().trim().min(20).max(200)

router.post('/forgot-password', (req, res) => {
  const body = parse(z.object({ email }), req.body)
  const user = findByEmail(body.email)
  // Whatever happens, the answer is the same, so this can't be used to find out who has an account.
  if (user?.active) {
    const last = db.prepare('SELECT created_at FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id) as unknown as { created_at: string } | undefined
    if (!last || Date.now() - Date.parse(last.created_at) > RESET_COOLDOWN_MS) {
      const token = randomToken(32)
      tx(() => {
        db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id) // only the newest link works
        db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?)').run(
          user.id,
          sha256(token),
          new Date(Date.now() + RESET_TTL_MINUTES * 60_000).toISOString(),
          new Date().toISOString(),
        )
      })
      // Sent in the background so the response time doesn't reveal whether the account exists.
      sendMail({
        to: user.email,
        subject: 'Reset your FixNest password',
        text: [
          `Hi ${user.name.split(/\s+/)[0]},`,
          '',
          'Someone (hopefully you) asked to reset the password for your FixNest account.',
          '',
          `Choose a new password here (the link works once and expires in ${RESET_TTL_MINUTES} minutes):`,
          `${config.appUrl}/reset-password#token=${token}`,
          '',
          "If you didn't ask for this, you can ignore this email. Your password won't change.",
        ].join('\n'),
      }).catch((e) => console.error('[mail] password reset email failed:', e instanceof Error ? e.message : e))
    }
  }
  res.json({ ok: true })
})

const LINK_BAD = () => new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.', 'RESET_INVALID')

function findReset(token: string) {
  const row = db
    .prepare(
      `SELECT pr.user_id AS userId, pr.expires_at AS expiresAt, u.email, u.active
       FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.token_hash = ?`,
    )
    .get(sha256(token)) as unknown as { userId: number; expiresAt: string; email: string; active: number } | undefined
  if (!row || !row.active || Date.parse(row.expiresAt) < Date.now()) throw LINK_BAD()
  return row
}

const mask = (e: string) => e.replace(/^(.)[^@]*/, '$1***')

/** Lets the reset page say which account it is for (masked), or fail early on a bad link. */
router.post('/reset-password/check', (req, res) => {
  const { token } = parse(z.object({ token: resetToken }), req.body)
  res.json({ email: mask(findReset(token).email) })
})

router.post('/reset-password', async (req, res) => {
  const body = parse(z.object({ token: resetToken, password }), req.body)
  const reset = findReset(body.token)
  const hash = await hashPassword(body.password)
  tx(() => {
    // Following the emailed link proves they own the address, so this also confirms an unverified account.
    // Bumping the session version signs them out of every device.
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, session_version = session_version + 1 WHERE id = ?').run(hash, reset.userId)
    finalizeStudentLocation(reset.userId)
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(reset.userId)
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(reset.userId)
  })
  sendWelcomeIfNew(reset.userId)
  clearFailures(reset.email)
  res.json({ ok: true })
})

// ---- preferences ---------------------------------------------------------------------------------------

router.patch('/preferences', requireAuth, (req, res) => {
  const body = parse(z.object({ emailNotifications: z.boolean() }), req.body)
  db.prepare('UPDATE users SET email_notifications = ? WHERE id = ?').run(body.emailNotifications ? 1 : 0, req.user!.id)
  res.json({ user: publicUser(req.user!.id) })
})

router.post('/logout', (req, res) => {
  // Ends this device's login on the server too, so a copied cookie cannot be used again.
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE] ?? '', config.jwtSecret) as unknown as { kind?: string; sid?: string }
    if (payload.kind === 'session' && payload.sid) endSession(payload.sid)
  } catch {
    // Nothing to end: the cookie was missing or already invalid.
  }
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
})

// ---- active devices ------------------------------------------------------------------------------------

router.get('/sessions', requireAuth, (req, res) => {
  res.json({ sessions: listSessions(req.user!.id, req.sessionId) })
})

/** Log out every other device, keeping this one. */
router.post('/sessions/revoke-others', requireAuth, (req, res) => {
  res.json({ ok: true, loggedOut: revokeOtherSessions(req.user!.id, req.sessionId) })
})

/** Log out one device. */
router.delete('/sessions/:id', requireAuth, (req, res) => {
  if (!revokeSession(req.user!.id, String(req.params.id))) throw notFound('That device is not signed in any more.')
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!.id) })
})

export default router
