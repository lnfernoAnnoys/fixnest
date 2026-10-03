import { config } from '../config.js'
import { db } from '../db/connection.js'
import { forbidden, notFound } from '../lib/errors.js'
import { isManager, type AuthUser } from '../middleware/auth.js'
import { imageUrl } from './uploads.js'

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const STATUSES = ['submitted', 'assigned', 'in_progress', 'fixed', 'rejected', 'cancelled'] as const
export const OPEN_STATUSES = ['submitted', 'assigned', 'in_progress'] as const
export type Priority = (typeof PRIORITIES)[number]
export type Status = (typeof STATUSES)[number]

/** SQL list of open statuses, e.g. 'submitted','assigned','in_progress'. */
export const OPEN_LIST = OPEN_STATUSES.map((s) => `'${s}'`).join(',')

/** SQL condition (table alias `c`): still open and past its priority's target time. */
const HOURS_CASE = `CASE c.priority ${Object.entries(config.overdueHours)
  .map(([p, h]) => `WHEN '${p}' THEN ${Number(h)}`)
  .join(' ')} ELSE 72 END`
export const OVERDUE_SQL = `(c.status IN (${OPEN_LIST}) AND datetime(c.created_at, '+' || (${HOURS_CASE}) || ' hours') < datetime('now'))`

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; the API returns ISO-8601. */
export const iso = (s: string | null) => (s ? (s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null)

export const SELECT_COMPLAINT = `
  SELECT c.id, c.code, c.description, c.priority, c.status, c.location_note, c.image_path,
         c.resolution_note, c.resolution_image_path, c.created_at, c.updated_at, c.assigned_at, c.acknowledged_at, c.resolved_at,
         cat.id AS category_id, cat.name AS category,
         h.id AS hostel_id, h.name AS hostel, r.id AS room_id, r.number AS room, r.floor AS floor,
         s.id AS student_id, s.name AS student_name, s.email AS student_email,
         st.id AS staff_id, st.name AS staff_name
  FROM complaints c
  JOIN categories cat ON cat.id = c.category_id
  JOIN hostels h ON h.id = c.hostel_id
  LEFT JOIN rooms r ON r.id = c.room_id
  JOIN users s ON s.id = c.student_id
  LEFT JOIN users st ON st.id = c.assigned_staff_id`

type Row = Record<string, string | number | null>

/** Shapes a DB row for the API. Only wardens and admins see the student's email. */
export function toComplaint(row: Row, viewer: AuthUser) {
  const createdMs = Date.parse(iso(row.created_at as string)!)
  const limitH = config.overdueHours[row.priority as string] ?? 72
  const dueAt = new Date(createdMs + limitH * 3_600_000).toISOString()
  const isOpen = (OPEN_STATUSES as readonly string[]).includes(row.status as string)
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    priority: row.priority,
    status: row.status,
    category: { id: row.category_id, name: row.category },
    location: {
      hostelId: row.hostel_id,
      hostel: row.hostel,
      roomId: row.room_id,
      room: row.room,
      floor: row.floor,
      note: row.location_note,
    },
    student: {
      id: row.student_id,
      name: row.student_name,
      ...(isManager(viewer.role) ? { email: row.student_email } : {}),
    },
    assignedStaff: row.staff_id ? { id: row.staff_id, name: row.staff_name } : null,
    imageUrl: imageUrl(row.image_path as string | null),
    resolutionNote: row.resolution_note,
    resolutionImageUrl: imageUrl(row.resolution_image_path as string | null),
    createdAt: iso(row.created_at as string),
    updatedAt: iso(row.updated_at as string),
    assignedAt: iso(row.assigned_at as string | null),
    acknowledgedAt: iso(row.acknowledged_at as string | null),
    resolvedAt: iso(row.resolved_at as string | null),
    dueAt,
    isOverdue: isOpen && Date.now() > Date.parse(dueAt),
  }
}

export function loadComplaint(codeOrId: string): Row | undefined {
  const isCode = /^HST-\d+$/i.test(codeOrId)
  if (!isCode && !/^\d+$/.test(codeOrId)) return undefined
  return db
    .prepare(`${SELECT_COMPLAINT} WHERE ${isCode ? 'c.code = ?' : 'c.id = ?'}`)
    .get(isCode ? codeOrId.toUpperCase() : Number(codeOrId)) as Row | undefined
}

/** Students see their own; staff see what is assigned to them; wardens and admins see everything. */
export function canAccess(user: AuthUser, row: Row) {
  if (isManager(user.role)) return true
  if (user.role === 'student') return row.student_id === user.id
  return row.staff_id === user.id
}

/** Loads a complaint the user may see. Unauthorized access looks exactly like "not found". */
export function loadAccessible(user: AuthUser, codeOrId: string): Row {
  const row = loadComplaint(codeOrId)
  if (!row) throw notFound('Complaint not found.')
  if (!canAccess(user, row)) throw notFound('Complaint not found.')
  return row
}

export function requireOpen(row: Row) {
  if (!(OPEN_STATUSES as readonly string[]).includes(row.status as string)) {
    throw forbidden('This complaint is already closed.')
  }
}

export type HistoryType = 'status' | 'note' | 'priority' | 'assignment'

export function addHistory(
  complaintId: number,
  actorId: number,
  type: HistoryType,
  opts: { from?: string | null; to?: string | null; note?: string | null; image?: string | null } = {},
) {
  db.prepare(
    'INSERT INTO status_history (complaint_id, actor_id, type, from_status, to_status, note, image_path) VALUES (?,?,?,?,?,?,?)',
  ).run(complaintId, actorId, type, opts.from ?? null, opts.to ?? null, opts.note ?? null, opts.image ?? null)
  db.prepare("UPDATE complaints SET updated_at = datetime('now') WHERE id = ?").run(complaintId)
}

export function loadTimeline(complaintId: number) {
  const rows = db
    .prepare(
      `SELECT h.id, h.type, h.from_status, h.to_status, h.note, h.image_path, h.created_at,
              u.id AS actor_id, u.name AS actor_name, u.role AS actor_role
       FROM status_history h JOIN users u ON u.id = h.actor_id
       WHERE h.complaint_id = ? ORDER BY h.id`,
    )
    .all(complaintId) as Row[]
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    imageUrl: imageUrl(r.image_path as string | null),
    createdAt: iso(r.created_at as string),
    actor: { id: r.actor_id, name: r.actor_name, role: r.actor_role },
  }))
}
