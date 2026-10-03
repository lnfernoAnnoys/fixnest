import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db/connection.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { hashPassword } from '../lib/security.js'
import { parse } from '../lib/validate.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { avatarUrlFor } from '../services/profile.js'

/**
 * Wardens and admins: people, hostels and rooms, categories. A warden can look after students and staff;
 * changing the setup (hostels, rooms, categories) and managing wardens is for admins.
 */
const router = Router()
router.use(requireAuth, requireRole('warden', 'admin'))
const adminOnly = requireRole('admin')

type Row = Record<string, number | string | null>
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as unknown as Row[]
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as unknown as Row | undefined
const num = (v: unknown) => Number(v) || 0
const id = (v: unknown) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw notFound()
  return n
}
const iso = (s: unknown) => (s ? String(s).replace(' ', 'T') + 'Z' : null)
const uniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE constraint failed/.test(e.message)

// ---- people -------------------------------------------------------------------------------------

const listQuery = z.object({
  role: z.enum(['student', 'staff', 'warden']).default('student'),
  q: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(60).optional()),
  active: z.enum(['1', '0']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

router.get('/users', (req, res) => {
  const q = parse(listQuery, req.query)
  if (q.role === 'warden' && req.user!.role !== 'admin') throw forbidden('Only an admin can see the wardens.')
  const where = ['u.role = ?']
  const args: (string | number)[] = [q.role]
  if (q.active) (where.push('u.active = ?'), args.push(Number(q.active)))
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`
    where.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')")
    args.push(like, like)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`
  const total = num(one(`SELECT COUNT(*) AS n FROM users u ${whereSql}`, ...args)!.n)
  const rows = all(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.active, u.avatar_url, u.avatar_path, (u.google_sub IS NOT NULL) AS google, u.created_at,
            sp.specialty,
            h.name AS hostel, r.number AS room,
            (SELECT COUNT(*) FROM complaints c WHERE c.student_id = u.id) AS filed,
            (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff_id = u.id AND c.status IN ('assigned','in_progress')) AS openAssigned
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN student_profiles st ON st.user_id = u.id
     LEFT JOIN hostels h ON h.id = st.hostel_id
     LEFT JOIN rooms r ON r.id = st.room_id
     ${whereSql}
     ORDER BY u.active DESC, u.name COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    ...args,
    q.pageSize,
    (q.page - 1) * q.pageSize,
  )
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      phone: r.phone,
      active: !!r.active,
      avatarUrl: avatarUrlFor(num(r.id), r.avatar_path as string | null, r.avatar_url as string | null),
      googleLinked: !!r.google,
      createdAt: iso(r.created_at),
      specialty: r.specialty,
      hostel: r.hostel,
      room: r.room,
      complaintsFiled: num(r.filed),
      openAssigned: num(r.openAssigned),
    })),
  })
})

const createAccount = z.object({
  role: z.enum(['staff', 'warden']).default('staff'),
  name: z.string().trim().min(2, 'Enter their full name').max(80),
  email: z.string().trim().toLowerCase().max(120).pipe(z.email('Enter a valid email address')),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
  specialty: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(60).optional()),
  phone: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(20).optional()),
})

/** Staff accounts are created by a warden or admin, warden accounts by an admin. (Students sign up themselves.) */
router.post('/users', async (req, res) => {
  const body = parse(createAccount, req.body)
  if (body.role === 'warden' && req.user!.role !== 'admin') throw forbidden('Only an admin can add a warden.')
  if (one('SELECT 1 AS x FROM users WHERE email = ?', body.email)) throw conflict('An account with this email already exists.', 'EMAIL_TAKEN')
  const hash = await hashPassword(body.password)
  const userId = tx(() => {
    const uid = Number(
      db
        .prepare('INSERT INTO users (name,email,password_hash,role,phone,email_verified) VALUES (?,?,?,?,?,1)')
        .run(body.name, body.email, hash, body.role, body.phone ?? null).lastInsertRowid,
    )
    if (body.role === 'staff') db.prepare('INSERT INTO staff_profiles (user_id, specialty) VALUES (?,?)').run(uid, body.specialty ?? null)
    return uid
  })
  res.status(201).json({ id: userId })
})

/** Students and staff can be managed by a warden or admin, wardens by an admin only. Admins and your own account are off limits. */
function managedUser(userId: number, acting: { id: number; role: string }) {
  const u = one('SELECT id, role, active FROM users WHERE id = ?', userId)
  if (!u) throw notFound('User not found.')
  if (u.role === 'admin') throw forbidden('Admin accounts cannot be changed here.')
  if (u.role === 'warden' && acting.role !== 'admin') throw forbidden('Only an admin can manage a warden.')
  if (u.id === acting.id) throw forbidden("You can't change your own account here.")
  return u
}

const patchUser = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(80).optional(),
  specialty: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(20).optional(),
})

router.patch('/users/:id', (req, res) => {
  const userId = id(req.params.id)
  const u = managedUser(userId, req.user!)
  const body = parse(patchUser, req.body)
  tx(() => {
    if (body.active !== undefined) {
      // Deactivating also bumps the session version, so any session already open ends at once.
      db.prepare('UPDATE users SET active = ?, session_version = session_version + 1 WHERE id = ?').run(body.active ? 1 : 0, userId)
    }
    if (body.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, userId)
    if (body.phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(body.phone || null, userId)
    if (body.specialty !== undefined && u.role === 'staff') {
      db.prepare('INSERT INTO staff_profiles (user_id, specialty) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET specialty = excluded.specialty').run(userId, body.specialty || null)
    }
  })
  const openAssigned = num(one("SELECT COUNT(*) AS n FROM complaints WHERE assigned_staff_id = ? AND status IN ('assigned','in_progress')", userId)!.n)
  res.json({ ok: true, openAssigned })
})

router.post('/users/:id/reset-password', async (req, res) => {
  const userId = id(req.params.id)
  managedUser(userId, req.user!)
  const { password } = parse(z.object({ password: z.string().min(8, 'Use at least 8 characters').max(72) }), req.body)
  db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').run(await hashPassword(password), userId)
  res.json({ ok: true })
})

// ---- hostels and rooms --------------------------------------------------------------------------

const hostelName = z.string().trim().min(2, 'Enter a hostel name').max(60)
const roomNumber = z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Use letters, digits or dashes (up to 10)')

router.get('/hostels', (_req, res) => {
  const hostels = all(`SELECT h.id, h.name, (SELECT COUNT(*) FROM complaints c WHERE c.hostel_id = h.id) AS complaints FROM hostels h ORDER BY h.name`)
  const rooms = all(
    `SELECT r.id, r.hostel_id, r.floor, r.number,
            (SELECT COUNT(*) FROM complaints c WHERE c.room_id = r.id) AS complaints,
            (SELECT COUNT(*) FROM student_profiles s WHERE s.room_id = r.id) AS students
     FROM rooms r ORDER BY r.hostel_id, r.floor, CAST(r.number AS INTEGER), r.number`,
  )
  res.json({
    hostels: hostels.map((h) => ({
      id: h.id,
      name: h.name,
      complaints: num(h.complaints),
      rooms: rooms
        .filter((r) => r.hostel_id === h.id)
        .map((r) => ({ id: r.id, floor: r.floor, number: r.number, complaints: num(r.complaints), students: num(r.students) })),
    })),
  })
})

router.post('/hostels', adminOnly, (req, res) => {
  const { name } = parse(z.object({ name: hostelName }), req.body)
  try {
    const hid = Number(db.prepare('INSERT INTO hostels (name) VALUES (?)').run(name).lastInsertRowid)
    res.status(201).json({ id: hid })
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('A hostel with that name already exists.', 'NAME_TAKEN')
    throw e
  }
})

router.patch('/hostels/:id', adminOnly, (req, res) => {
  const hid = id(req.params.id)
  if (!one('SELECT 1 AS x FROM hostels WHERE id = ?', hid)) throw notFound('Hostel not found.')
  const { name } = parse(z.object({ name: hostelName }), req.body)
  try {
    db.prepare('UPDATE hostels SET name = ? WHERE id = ?').run(name, hid)
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('A hostel with that name already exists.', 'NAME_TAKEN')
    throw e
  }
  res.json({ ok: true })
})

router.delete('/hostels/:id', adminOnly, (req, res) => {
  const hid = id(req.params.id)
  if (!one('SELECT 1 AS x FROM hostels WHERE id = ?', hid)) throw notFound('Hostel not found.')
  const rooms = num(one('SELECT COUNT(*) AS n FROM rooms WHERE hostel_id = ?', hid)!.n)
  const complaints = num(one('SELECT COUNT(*) AS n FROM complaints WHERE hostel_id = ?', hid)!.n)
  if (rooms > 0 || complaints > 0) {
    throw conflict('This hostel still has rooms or complaint history, so it cannot be deleted. Remove its rooms first (only possible if they have no history).', 'IN_USE')
  }
  db.prepare('DELETE FROM hostels WHERE id = ?').run(hid)
  res.json({ ok: true })
})

const addRooms = z
  .object({
    floor: z.number().int().min(0).max(50),
    number: roomNumber.optional(),
    from: z.number().int().min(0).max(99999).optional(),
    to: z.number().int().min(0).max(99999).optional(),
  })
  .refine((v) => v.number !== undefined || (v.from !== undefined && v.to !== undefined), { message: 'Give a room number, or a from/to range' })
  .refine((v) => v.from === undefined || v.to === undefined || (v.to >= v.from && v.to - v.from < 200), { message: 'The range must go up and cover at most 200 rooms' })

/** Add one room ({floor, number}) or a run of rooms ({floor, from, to}). Existing numbers are skipped. */
router.post('/hostels/:id/rooms', adminOnly, (req, res) => {
  const hid = id(req.params.id)
  if (!one('SELECT 1 AS x FROM hostels WHERE id = ?', hid)) throw notFound('Hostel not found.')
  const body = parse(addRooms, req.body)
  const numbers = body.number !== undefined ? [body.number] : Array.from({ length: body.to! - body.from! + 1 }, (_, i) => String(body.from! + i))
  let created = 0
  const skipped: string[] = []
  tx(() => {
    const insert = db.prepare('INSERT OR IGNORE INTO rooms (hostel_id, floor, number) VALUES (?,?,?)')
    for (const n of numbers) {
      if (Number(insert.run(hid, body.floor, n).changes) === 1) created++
      else skipped.push(n)
    }
  })
  if (body.number !== undefined && created === 0) throw conflict(`Room ${body.number} already exists in this hostel.`, 'ROOM_EXISTS')
  res.status(201).json({ created, skipped })
})

const patchRoom = z.object({ floor: z.number().int().min(0).max(50).optional(), number: roomNumber.optional() })

router.patch('/rooms/:id', adminOnly, (req, res) => {
  const rid = id(req.params.id)
  const room = one('SELECT id, hostel_id FROM rooms WHERE id = ?', rid)
  if (!room) throw notFound('Room not found.')
  const body = parse(patchRoom, req.body)
  try {
    if (body.floor !== undefined) db.prepare('UPDATE rooms SET floor = ? WHERE id = ?').run(body.floor, rid)
    if (body.number !== undefined) db.prepare('UPDATE rooms SET number = ? WHERE id = ?').run(body.number, rid)
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('That room number already exists in this hostel.', 'ROOM_EXISTS')
    throw e
  }
  res.json({ ok: true })
})

router.delete('/rooms/:id', adminOnly, (req, res) => {
  const rid = id(req.params.id)
  if (!one('SELECT 1 AS x FROM rooms WHERE id = ?', rid)) throw notFound('Room not found.')
  const complaints = num(one('SELECT COUNT(*) AS n FROM complaints WHERE room_id = ?', rid)!.n)
  const students = num(one('SELECT COUNT(*) AS n FROM student_profiles WHERE room_id = ?', rid)!.n)
  if (complaints > 0 || students > 0) {
    throw conflict(`This room has ${students} student(s) and ${complaints} complaint(s) linked to it, so it cannot be deleted.`, 'IN_USE')
  }
  db.prepare('DELETE FROM rooms WHERE id = ?').run(rid)
  res.json({ ok: true })
})

// ---- categories ---------------------------------------------------------------------------------

const categoryName = z.string().trim().min(2, 'Enter a category name').max(40)

router.get('/categories', (_req, res) => {
  res.json({
    categories: all(`SELECT cat.id, cat.name, cat.active, (SELECT COUNT(*) FROM complaints c WHERE c.category_id = cat.id) AS complaints FROM categories cat ORDER BY cat.id`).map((c) => ({
      id: c.id,
      name: c.name,
      active: !!c.active,
      complaints: num(c.complaints),
    })),
  })
})

router.post('/categories', adminOnly, (req, res) => {
  const { name } = parse(z.object({ name: categoryName }), req.body)
  try {
    res.status(201).json({ id: Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run(name).lastInsertRowid) })
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('A category with that name already exists.', 'NAME_TAKEN')
    throw e
  }
})

router.patch('/categories/:id', adminOnly, (req, res) => {
  const cid = id(req.params.id)
  if (!one('SELECT 1 AS x FROM categories WHERE id = ?', cid)) throw notFound('Category not found.')
  const body = parse(z.object({ name: categoryName.optional(), active: z.boolean().optional() }), req.body)
  if (body.active === false && num(one('SELECT COUNT(*) AS n FROM categories WHERE active = 1 AND id <> ?', cid)!.n) === 0) {
    throw conflict('At least one category must stay active so students can file complaints.', 'LAST_ACTIVE')
  }
  try {
    if (body.name) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(body.name, cid)
    if (body.active !== undefined) db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(body.active ? 1 : 0, cid)
  } catch (e) {
    if (uniqueViolation(e)) throw conflict('A category with that name already exists.', 'NAME_TAKEN')
    throw e
  }
  res.json({ ok: true })
})

export default router
