import path from 'node:path'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { config } from '../config.js'
import { db, tx } from '../db/connection.js'
import { z } from 'zod'
import { badRequest, HttpError, notFound } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { resolveLocation } from '../services/location.js'
import { deleteAvatarFile, nextRoomChangeAt, normalizePhone } from '../services/profile.js'
import { imageUpload, saveImage } from '../services/uploads.js'
import { publicUser } from './auth.js'

/** A person's own profile: picture, and (for students) hostel and room. Everything here needs a signed-in user. */
const router = Router()
router.use(requireAuth)

/** The web app already shrinks pictures to a small square; this is the server's own ceiling. */
const MAX_AVATAR_BYTES = 1_000_000
/** People who may look at anyone's picture (the warden's People list). Everyone else sees only their own. */
const CAN_SEE_OTHERS = ['warden', 'admin']

const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You have changed your picture a lot. Please try again later.', code: 'RATE_LIMIT' },
})

const currentPath = (userId: number) =>
  (db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as unknown as { avatar_path: string | null } | undefined)?.avatar_path ?? null

router.post('/avatar', uploadLimiter, imageUpload, (req, res) => {
  if (!req.file) throw badRequest('Choose a picture first.', 'NO_FILE')
  if (req.file.size > MAX_AVATAR_BYTES) throw badRequest('That picture is too large. Choose one under 1 MB.', 'FILE_TOO_LARGE')
  const userId = req.user!.id
  const name = saveImage(req.file)
  const old = currentPath(userId)
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(name, userId)
  deleteAvatarFile(old)
  res.json({ user: publicUser(userId) })
})

/** Back to the Google photo if there is one, otherwise the person's initials. */
router.delete('/avatar', (req, res) => {
  const userId = req.user!.id
  const old = currentPath(userId)
  db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(userId)
  deleteAvatarFile(old)
  res.json({ user: publicUser(userId) })
})

/** The person's mobile number, for the hostel office to reach them. Blank removes it. It is not verified. */
router.patch('/phone', (req, res) => {
  const { phone } = parse(z.object({ phone: z.string().trim().max(30) }), req.body)
  db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone === '' ? null : normalizePhone(phone), req.user!.id)
  res.json({ user: publicUser(req.user!.id) })
})

const locationBody = z.object({
  hostelName: z.string().max(60).optional(),
  roomNumber: z.string().max(20).optional(),
  hostelId: z.number().int().positive().optional(),
  roomId: z.number().int().positive().optional(),
})

/**
 * A student moves themselves to another hostel or room by typing the hostel name and room number.
 * Allowed once every roomChangeCooldownDays; the first change is free. Complaints already filed keep the
 * room they were filed for.
 */
router.patch('/location', requireRole('student'), (req, res) => {
  const userId = req.user!.id
  const body = parse(locationBody, req.body)
  const current = db.prepare('SELECT room_id, location_changed_at FROM student_profiles WHERE user_id = ?').get(userId) as unknown as
    | { room_id: number | null; location_changed_at: string | null }
    | undefined
  const next = nextRoomChangeAt(current?.location_changed_at ?? null)
  if (next) {
    const on = new Date(next).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    throw new HttpError(429, `You changed your room recently. You can change it again on ${on}.`, 'ROOM_CHANGE_COOLDOWN')
  }
  tx(() => {
    const target = resolveLocation(body)
    if (current?.room_id === target.roomId) throw badRequest('That is already your room.', 'SAME_ROOM')
    db.prepare(
      `INSERT INTO student_profiles (user_id, hostel_id, room_id, location_changed_at) VALUES (?,?,?,datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET hostel_id = excluded.hostel_id, room_id = excluded.room_id, location_changed_at = excluded.location_changed_at`,
    ).run(userId, target.hostelId, target.roomId)
  })
  res.json({ user: publicUser(userId) })
})

router.get('/avatar/:userId', (req, res) => {
  const target = Number(req.params.userId)
  if (!Number.isInteger(target) || target <= 0) throw notFound('Picture not found.')
  if (target !== req.user!.id && !CAN_SEE_OTHERS.includes(req.user!.role)) throw notFound('Picture not found.')
  const name = currentPath(target)
  if (!name) throw notFound('Picture not found.')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.sendFile(name, { root: path.resolve(config.uploadDir) })
})

export default router
