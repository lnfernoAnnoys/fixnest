import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { db, tx } from '../db/connection.js'
import { badRequest, conflict, forbidden } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { isManager, requireAuth, requireRole, type AuthUser } from '../middleware/auth.js'
import { limitConcurrentUploads } from '../middleware/uploadGuard.js'
import {
  addHistory,
  loadAccessible,
  loadComplaint,
  loadTimeline,
  OPEN_LIST,
  OPEN_STATUSES,
  OVERDUE_SQL,
  PRIORITIES,
  requireOpen,
  SELECT_COMPLAINT,
  STATUSES,
  toComplaint,
} from '../services/complaints.js'
import { notify, notifyAdmins } from '../services/notify.js'
import { findHostel, resolveLocation } from '../services/location.js'
import { imageUpload, mediaUpload, saveImage, saveMedia } from '../services/uploads.js'

const router = Router()
router.use(requireAuth)

/** Multipart text fields arrive as strings; treat "" as "not provided". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optId = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional())
const optText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional())

const PRIORITY_RANK = `CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`

const SORTS = {
  newest: 'c.created_at DESC, c.id DESC',
  oldest: 'c.created_at ASC, c.id ASC',
  priority: `${PRIORITY_RANK}, c.created_at DESC`,
  updated: 'c.updated_at DESC, c.id DESC',
} as const

const listQuery = z.object({
  status: z.enum([...STATUSES, 'open']).optional(),
  priority: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^(low|medium|high|urgent)(,(low|medium|high|urgent))*$/, 'Invalid priority')
      .optional(),
  ),
  categoryId: optId,
  hostelId: optId,
  staffId: optId,
  overdue: z.enum(['1']).optional(),
  q: optText(60),
  from: z.preprocess(blankToUndefined, z.iso.date().optional()),
  to: z.preprocess(blankToUndefined, z.iso.date().optional()),
  sort: z.enum(['newest', 'oldest', 'priority', 'updated']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** The SQL restriction that keeps each role inside its own data. */
function scope(user: AuthUser) {
  if (user.role === 'student') return { sql: 'c.student_id = ?', args: [user.id] }
  if (user.role === 'staff') return { sql: 'c.assigned_staff_id = ?', args: [user.id] }
  return { sql: '1 = 1', args: [] as number[] }
}

router.get('/', (req, res) => {
  const q = parse(listQuery, req.query)
  const user = req.user!
  const where = [scope(user).sql]
  const args: (string | number)[] = [...scope(user).args]

  if (q.status === 'open') where.push(`c.status IN (${OPEN_LIST})`)
  else if (q.status) (where.push('c.status = ?'), args.push(q.status))
  if (q.priority) {
    const list = [...new Set(q.priority.split(','))]
    where.push(`c.priority IN (${list.map(() => '?').join(',')})`)
    args.push(...list)
  }
  if (q.categoryId) (where.push('c.category_id = ?'), args.push(q.categoryId))
  if (q.hostelId) (where.push('c.hostel_id = ?'), args.push(q.hostelId))
  if (q.staffId && isManager(user.role)) (where.push('c.assigned_staff_id = ?'), args.push(q.staffId))
  if (q.overdue) where.push(OVERDUE_SQL)
  if (q.from) (where.push('date(c.created_at) >= ?'), args.push(q.from))
  if (q.to) (where.push('date(c.created_at) <= ?'), args.push(q.to))
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`
    where.push(
      `(c.code LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR r.number LIKE ? ESCAPE '\\' OR h.name LIKE ? ESCAPE '\\'
        OR cat.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')`,
    )
    args.push(like, like, like, like, like, like)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM complaints c JOIN users s ON s.id=c.student_id JOIN hostels h ON h.id=c.hostel_id
         JOIN categories cat ON cat.id=c.category_id LEFT JOIN rooms r ON r.id=c.room_id ${whereSql}`,
      )
      .get(...args) as unknown as { n: number }
  ).n
  const rows = db
    .prepare(`${SELECT_COMPLAINT} ${whereSql} ORDER BY ${SORTS[q.sort]} LIMIT ? OFFSET ?`)
    .all(...args, q.pageSize, (q.page - 1) * q.pageSize) as Record<string, string | number | null>[]

  res.json({ items: rows.map((r) => toComplaint(r, user)), total, page: q.page, pageSize: q.pageSize })
})

/** Counts by status (and overdue) inside the caller's own scope. Powers the dashboards. */
router.get('/summary', (req, res) => {
  const { sql, args } = scope(req.user!)
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>
  for (const r of db.prepare(`SELECT c.status, COUNT(*) AS n FROM complaints c WHERE ${sql} GROUP BY c.status`).all(...args) as unknown as {
    status: string
    n: number
  }[]) {
    byStatus[r.status] = r.n
  }
  const overdue = (
    db.prepare(`SELECT COUNT(*) AS n FROM complaints c WHERE ${sql} AND ${OVERDUE_SQL}`).get(...args) as unknown as { n: number }
  ).n
  res.json({ byStatus, overdue, total: Object.values(byStatus).reduce((a, b) => a + b, 0) })
})

const createSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  description: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(1000),
  priority: z.preprocess(blankToUndefined, z.enum(PRIORITIES).default('medium')),
  hostelId: optId,
  roomId: optId,
  /** What the student typed for another room or a common area. */
  hostelName: optText(60),
  roomNumber: optText(20),
  locationNote: optText(120),
})

const createLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u${req.user!.id}`,
  message: { error: 'You have filed a lot of complaints in the last hour. Please try again later.', code: 'RATE_LIMIT' },
})

router.post('/', requireRole('student'), createLimiter, limitConcurrentUploads, mediaUpload, (req, res) => {
  const user = req.user!
  const body = parse(createSchema, req.body)

  if (!db.prepare('SELECT 1 FROM categories WHERE id=? AND active=1').get(body.categoryId)) {
    throw badRequest('Choose a valid category.', 'VALIDATION')
  }

  // Work out where the problem is: an explicit choice first, then the student's own room.
  let hostelId: number | null = null
  let roomId: number | null = null
  let locationNote = body.locationNote ?? null
  if (body.roomId) {
    const room = db.prepare('SELECT id, hostel_id FROM rooms WHERE id=?').get(body.roomId) as unknown as
      | { id: number; hostel_id: number }
      | undefined
    if (!room || (body.hostelId && room.hostel_id !== body.hostelId)) throw badRequest('Choose a valid room.', 'VALIDATION')
    ;({ id: roomId, hostel_id: hostelId } = room)
  } else if (body.hostelName && body.roomNumber) {
    ;({ hostelId, roomId } = resolveLocation({ hostelName: body.hostelName, roomNumber: body.roomNumber }))
  } else if (body.hostelId || body.hostelName) {
    // Common area (corridor, washroom, mess...): needs a hostel and a description of the place.
    if (body.hostelId && !db.prepare('SELECT 1 FROM hostels WHERE id=?').get(body.hostelId)) throw badRequest('Choose a valid hostel.', 'VALIDATION')
    if (!locationNote) throw badRequest('Say where the problem is, for example "2nd floor washroom".', 'VALIDATION')
    hostelId = body.hostelId ?? findHostel(body.hostelName!)
  } else {
    const profile = db.prepare('SELECT hostel_id, room_id FROM student_profiles WHERE user_id=?').get(user.id) as unknown as
      | { hostel_id: number | null; room_id: number | null }
      | undefined
    if (!profile?.hostel_id) throw badRequest('Choose where the problem is.', 'VALIDATION')
    hostelId = profile.hostel_id
    roomId = profile.room_id
  }

  const image = saveMedia(req.file)

  const created = tx(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO complaints (code, student_id, hostel_id, room_id, location_note, category_id, description, priority, image_path)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(`TMP-${Date.now()}-${Math.random()}`, user.id, hostelId, roomId, locationNote, body.categoryId, body.description, body.priority, image)
        .lastInsertRowid,
    )
    const code = `HST-${1000 + id}`
    db.prepare('UPDATE complaints SET code=? WHERE id=?').run(code, id)
    addHistory(id, user.id, 'status', { to: 'submitted', note: 'Complaint submitted' })
    return { id, code }
  })

  notify(user.id, created.id, `Complaint ${created.code} submitted`, 'We received your complaint. You will be notified when it is assigned.', { email: false })
  notifyAdmins(created.id, `New complaint ${created.code}`, `${user.name} reported: ${body.description.slice(0, 80)}`)

  const row = loadComplaint(String(created.id))!
  res.status(201).json({ complaint: toComplaint(row, user) })
})

router.get('/:code', (req, res) => {
  const row = loadAccessible(req.user!, String(req.params.code))
  res.json({ complaint: toComplaint(row, req.user!), timeline: loadTimeline(row.id as number) })
})

/** Students may cancel until work has actually started. */
router.post('/:code/cancel', requireRole('student'), (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  requireOpen(row)
  if (row.status !== 'submitted' && row.status !== 'assigned') {
    throw forbidden('This complaint is already being worked on, so it can no longer be cancelled. Add a note instead.')
  }
  const id = row.id as number
  tx(() => {
    db.prepare("UPDATE complaints SET status='cancelled' WHERE id=?").run(id)
    addHistory(id, user.id, 'status', { from: row.status as string, to: 'cancelled', note: 'Cancelled by student' })
  })
  if (row.staff_id) notify(row.staff_id as number, id, `Complaint ${row.code} cancelled`, 'The student cancelled this complaint.')
  notifyAdmins(id, `Complaint ${row.code} cancelled`, `${user.name} cancelled their complaint.`)
  notify(user.id, id, `Complaint ${row.code} cancelled`, 'Your complaint was cancelled.', { email: false })
  res.json({ complaint: toComplaint(loadComplaint(String(id))!, user), timeline: loadTimeline(id) })
})

const noteSchema = z.object({ note: z.string().trim().min(1, 'Write a note first').max(1000) })

/** Extra information from the student, or a progress note from staff/admin. */
const noteLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u${req.user!.id}`,
  message: { error: 'You have added a lot of notes in the last hour. Please try again later.', code: 'RATE_LIMIT' },
})

router.post('/:code/notes', noteLimiter, imageUpload, (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  requireOpen(row)
  const { note } = parse(noteSchema, req.body)
  const image = saveImage(req.file)
  const id = row.id as number
  addHistory(id, user.id, 'note', { note, image })

  const preview = note.length > 80 ? `${note.slice(0, 80)}...` : note
  if (user.role === 'student') {
    if (row.staff_id) notify(row.staff_id as number, id, `New info on ${row.code}`, preview)
    else notifyAdmins(id, `New info on ${row.code}`, preview)
  } else {
    notify(row.student_id as number, id, `Update on ${row.code}`, preview)
  }
  res.status(201).json({ timeline: loadTimeline(id) })
})

// ---- workflow: assign -> acknowledge -> in progress -> fixed ------------------------------------------

const LABEL: Record<string, string> = {
  submitted: 'Submitted',
  assigned: 'Assigned',
  in_progress: 'In progress',
  fixed: 'Fixed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const detail = (id: number, user: AuthUser) => ({ complaint: toComplaint(loadComplaint(String(id))!, user), timeline: loadTimeline(id) })
const preview = (text: string, max = 100) => (text.length > max ? `${text.slice(0, max)}...` : text)

/** A maintenance staff member confirms they have seen the assignment. */
router.post('/:code/acknowledge', requireRole('staff'), (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code)) // staff only ever load complaints assigned to them
  if (row.status !== 'assigned') throw forbidden('Only newly assigned complaints can be acknowledged.')
  if (row.acknowledged_at) throw conflict('You have already acknowledged this complaint.', 'ALREADY_ACKNOWLEDGED')
  const id = row.id as number
  tx(() => {
    db.prepare("UPDATE complaints SET acknowledged_at = datetime('now') WHERE id = ?").run(id)
    addHistory(id, user.id, 'assignment', { note: `${user.name} acknowledged the assignment` })
  })
  notify(row.student_id as number, id, `${row.code} acknowledged`, `${user.name} has seen your complaint and will start soon.`)
  res.json(detail(id, user))
})

const statusSchema = z.object({ status: z.enum(['in_progress', 'fixed', 'rejected']), note: optText(1000) })

/** Move a complaint forward. Staff: start work, mark fixed. A warden or admin can also reject. */
router.post('/:code/status', requireRole('staff', 'warden', 'admin'), imageUpload, (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  const body = parse(statusSchema, req.body)
  const from = row.status as string
  const to = body.status
  const forward = (from === 'assigned' && to === 'in_progress') || (from === 'in_progress' && to === 'fixed')
  const reject = isManager(user.role) && to === 'rejected' && ['submitted', 'assigned', 'in_progress'].includes(from)
  if (!forward && !reject) throw forbidden(`A complaint can't move from "${LABEL[from]}" to "${LABEL[to]}".`)

  const note = body.note
  if (to === 'fixed' && (!note || note.length < 5)) throw badRequest('Describe what you did to fix it (at least 5 characters).', 'VALIDATION')
  if (to === 'rejected' && (!note || note.length < 5)) throw badRequest('Give a reason for rejecting this complaint.', 'VALIDATION')
  const image = saveImage(req.file)
  const id = row.id as number

  tx(() => {
    if (to === 'fixed') {
      db.prepare("UPDATE complaints SET status='fixed', resolution_note=?, resolution_image_path=?, resolved_at=datetime('now') WHERE id=?").run(note!, image, id)
    } else if (to === 'in_progress') {
      db.prepare("UPDATE complaints SET status='in_progress', acknowledged_at=COALESCE(acknowledged_at, datetime('now')) WHERE id=?").run(id)
    } else {
      db.prepare("UPDATE complaints SET status='rejected', resolution_note=? WHERE id=?").run(note!, id)
    }
    addHistory(id, user.id, 'status', { from, to, note: note ?? null, image })
  })

  const student = row.student_id as number
  if (to === 'in_progress') {
    notify(student, id, `Work started on ${row.code}`, `${user.name} is working on it now.`)
  } else if (to === 'fixed') {
    notify(student, id, `${row.code} is fixed`, preview(note!))
    notifyAdmins(id, `${row.code} marked fixed`, `${user.name}: ${preview(note!)}`, user.id)
  } else {
    notify(student, id, `${row.code} was not accepted`, preview(note!))
    if (row.staff_id) notify(row.staff_id as number, id, `${row.code} was rejected`, preview(note!))
  }
  res.json(detail(id, user))
})

/** Warden or admin: give the complaint to a staff member (or move it to someone else). */
router.post('/:code/assign', requireRole('warden', 'admin'), (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  requireOpen(row)
  const { staffId } = parse(z.object({ staffId: z.number().int().positive() }), req.body)
  const staff = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'staff' AND active = 1 AND email_verified = 1").get(staffId) as unknown as
    | { id: number; name: string }
    | undefined
  if (!staff) throw badRequest('Choose an active maintenance staff member.', 'VALIDATION')
  if (row.staff_id === staff.id && row.status !== 'submitted') throw conflict(`Already assigned to ${staff.name}.`, 'ALREADY_ASSIGNED')
  const id = row.id as number
  const previousStaff = row.staff_id as number | null

  tx(() => {
    db.prepare("UPDATE complaints SET assigned_staff_id = ?, assigned_at = datetime('now'), acknowledged_at = NULL, status = 'assigned' WHERE id = ?").run(staff.id, id)
    addHistory(id, user.id, 'status', { from: row.status as string, to: 'assigned', note: `Assigned to ${staff.name}` })
  })
  notify(row.student_id as number, id, `${row.code} assigned`, `${staff.name} will handle your complaint.`)
  notify(staff.id, id, `New assignment ${row.code}`, `${row.category}: ${preview(row.description as string, 80)}`)
  if (previousStaff && previousStaff !== staff.id) notify(previousStaff, id, `${row.code} reassigned`, `This complaint was moved to ${staff.name}.`)
  res.json(detail(id, user))
})

/** Admin: change how urgent a complaint is. */
router.post('/:code/priority', requireRole('warden', 'admin'), (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  requireOpen(row)
  const { priority } = parse(z.object({ priority: z.enum(PRIORITIES) }), req.body)
  if (priority === row.priority) throw badRequest(`Priority is already ${priority}.`, 'VALIDATION')
  const id = row.id as number
  tx(() => {
    db.prepare('UPDATE complaints SET priority = ? WHERE id = ?').run(priority, id)
    addHistory(id, user.id, 'priority', { note: `Priority changed from ${row.priority} to ${priority}` })
  })
  notify(row.student_id as number, id, `${row.code} priority updated`, `Priority is now ${priority}.`)
  if (row.staff_id) notify(row.staff_id as number, id, `${row.code} priority is now ${priority}`, `${row.category} at ${row.hostel}${row.room ? ` room ${row.room}` : ''}.`)
  res.json(detail(id, user))
})

const REOPEN_WINDOW_DAYS = 7

/** A student says the problem is not actually fixed. Allowed for a week after it was marked fixed. */
router.post('/:code/reopen', requireRole('student'), (req, res) => {
  const user = req.user!
  const row = loadAccessible(user, String(req.params.code))
  if (row.status !== 'fixed') throw forbidden('Only fixed complaints can be reopened.')
  const resolvedMs = Date.parse(`${String(row.resolved_at).replace(' ', 'T')}Z`)
  if (Number.isNaN(resolvedMs) || Date.now() - resolvedMs > REOPEN_WINDOW_DAYS * 86_400_000) {
    throw forbidden(`This was fixed more than ${REOPEN_WINDOW_DAYS} days ago. Please file a new complaint.`)
  }
  const { note } = parse(z.object({ note: z.string().trim().min(5, 'Tell us what is still wrong').max(1000) }), req.body)
  const id = row.id as number
  const to = row.staff_id ? 'assigned' : 'submitted'
  tx(() => {
    db.prepare("UPDATE complaints SET status = ?, resolved_at = NULL, resolution_note = NULL, resolution_image_path = NULL, acknowledged_at = NULL WHERE id = ?").run(to, id)
    addHistory(id, user.id, 'status', { from: 'fixed', to, note: `Reopened: ${note}` })
  })
  if (row.staff_id) notify(row.staff_id as number, id, `${row.code} reopened`, preview(note))
  notifyAdmins(id, `${row.code} reopened`, `${user.name}: ${preview(note)}`)
  res.json(detail(id, user))
})

export default router
