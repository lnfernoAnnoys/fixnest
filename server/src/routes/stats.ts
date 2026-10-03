import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/connection.js'
import { parse } from '../lib/validate.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { OPEN_LIST, OVERDUE_SQL } from '../services/complaints.js'

const router = Router()
router.use(requireAuth, requireRole('warden', 'admin'))

// Days are bucketed in the server's local time zone, so "today" matches the warden's clock.
const offsetMinutes = -new Date().getTimezoneOffset()
const offsetModifier = `${offsetMinutes >= 0 ? '+' : ''}${offsetMinutes} minutes`
const localDay = (ms: number) => new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10)

type Row = Record<string, number | string | null>
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as unknown as Row[]
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as unknown as Row

/**
 * The warden's overview.
 *  - `now`: the current state (open, overdue, ...), independent of the chosen range.
 *  - `range`: what happened in the last N days, so every number below the filter agrees.
 */
router.get('/overview', (req, res) => {
  const { days } = parse(z.object({ days: z.enum(['7', '30', '90']).default('30').transform(Number) }), req.query)

  const now = one(`
    SELECT
      COALESCE(SUM(c.status IN (${OPEN_LIST})), 0) AS open,
      COALESCE(SUM(c.status = 'submitted'), 0) AS unassigned,
      COALESCE(SUM(c.status = 'assigned'), 0) AS assigned,
      COALESCE(SUM(c.status = 'in_progress'), 0) AS inProgress,
      COALESCE(SUM(c.status IN (${OPEN_LIST}) AND c.priority IN ('high','urgent')), 0) AS highPriority,
      COALESCE(SUM(${OVERDUE_SQL}), 0) AS overdue,
      COUNT(*) AS total
    FROM complaints c`)

  const dates = Array.from({ length: days }, (_, i) => localDay(Date.now() - (days - 1 - i) * 86_400_000))
  const start = dates[0]

  const opened = new Map(all(`SELECT date(created_at, ?) AS d, COUNT(*) AS n FROM complaints WHERE date(created_at, ?) >= ? GROUP BY d`, offsetModifier, offsetModifier, start).map((r) => [r.d as string, r.n as number]))
  const fixed = new Map(
    all(
      `SELECT date(resolved_at, ?) AS d, COUNT(*) AS n FROM complaints
       WHERE status = 'fixed' AND resolved_at IS NOT NULL AND date(resolved_at, ?) >= ? GROUP BY d`,
      offsetModifier,
      offsetModifier,
      start,
    ).map((r) => [r.d as string, r.n as number]),
  )
  const trend = dates.map((date) => ({ date, opened: opened.get(date) ?? 0, fixed: fixed.get(date) ?? 0 }))

  const byCategory = all(
    `SELECT cat.name AS name, COUNT(*) AS count FROM complaints c JOIN categories cat ON cat.id = c.category_id
     WHERE date(c.created_at, ?) >= ? GROUP BY cat.id ORDER BY count DESC, cat.name`,
    offsetModifier,
    start,
  )
  const byHostel = all(
    `SELECT h.name AS name, COUNT(*) AS count FROM complaints c JOIN hostels h ON h.id = c.hostel_id
     WHERE date(c.created_at, ?) >= ? GROUP BY h.id ORDER BY count DESC, h.name`,
    offsetModifier,
    start,
  )
  const avg = one(
    `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS hours, COUNT(*) AS n FROM complaints
     WHERE status = 'fixed' AND resolved_at IS NOT NULL AND date(resolved_at, ?) >= ?`,
    offsetModifier,
    start,
  )

  res.json({
    now,
    range: {
      days,
      opened: trend.reduce((a, t) => a + t.opened, 0),
      fixed: trend.reduce((a, t) => a + t.fixed, 0),
      avgResolutionHours: avg.hours == null ? null : Math.round((avg.hours as number) * 10) / 10,
      trend,
      byCategory,
      byHostel,
    },
  })
})

export default router
