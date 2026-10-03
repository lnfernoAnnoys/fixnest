import path from 'node:path'
import { Router } from 'express'
import { config } from '../config.js'
import { db } from '../db/connection.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { canAccess, loadComplaint } from '../services/complaints.js'
import { iso } from '../services/complaints.js'

/** Reference data: categories (public), notifications and files (signed-in). */
export const categoriesRouter = Router()
categoriesRouter.get('/', (_req, res) => {
  res.json({ categories: db.prepare('SELECT id, name FROM categories WHERE active=1 ORDER BY id').all() })
})

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)
notificationsRouter.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.id, n.title, n.body, n.read_at, n.created_at, c.code AS complaintCode
       FROM notifications n LEFT JOIN complaints c ON c.id = n.complaint_id
       WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`,
    )
    .all(req.user!.id) as unknown as Record<string, string | number | null>[]
  const unread = (
    db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user!.id) as unknown as { n: number }
  ).n
  res.json({
    unread,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      complaintCode: r.complaintCode,
      read: r.read_at !== null,
      createdAt: iso(r.created_at as string),
    })),
  })
})
notificationsRouter.post('/read-all', (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id=? AND read_at IS NULL").run(req.user!.id)
  res.json({ ok: true })
})
notificationsRouter.post('/:id/read', (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id=? AND user_id=? AND read_at IS NULL").run(
    Number(req.params.id) || 0,
    req.user!.id,
  )
  res.json({ ok: true })
})

export const filesRouter = Router()
filesRouter.use(requireAuth)
/** Photos are private: served only to people who can see the complaint they belong to. */
filesRouter.get('/:name', (req, res) => {
  const name = req.params.name
  if (!/^[A-Za-z0-9_-]{10,64}\.(jpg|png|webp|mp4|mov|webm)$/.test(name)) throw notFound('File not found.')
  const owner =
    (db.prepare('SELECT id FROM complaints WHERE image_path=? OR resolution_image_path=?').get(name, name) as unknown as
      | { id: number }
      | undefined) ??
    (db.prepare('SELECT complaint_id AS id FROM status_history WHERE image_path=?').get(name) as unknown as { id: number } | undefined)
  const row = owner && loadComplaint(String(owner.id))
  if (!row || !canAccess(req.user!, row)) throw notFound('File not found.')
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.sendFile(name, { root: path.resolve(config.uploadDir) })
})

export const staffRouter = Router()
staffRouter.use(requireAuth, requireRole('warden', 'admin'))
/** Maintenance staff with their current workload, for the "assign to" picker. */
staffRouter.get('/', (_req, res) => {
  const staff = db
    .prepare(
      `SELECT u.id, u.name, sp.specialty,
              (SELECT COUNT(*) FROM complaints c WHERE c.assigned_staff_id = u.id AND c.status IN ('assigned','in_progress')) AS openCount
       FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'staff' AND u.active = 1 AND u.email_verified = 1
       ORDER BY u.name`,
    )
    .all()
  res.json({ staff })
})
