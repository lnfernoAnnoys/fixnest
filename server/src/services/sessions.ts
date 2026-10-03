import type { Request } from 'express'
import { config } from '../config.js'
import { db } from '../db/connection.js'
import { randomToken } from '../lib/security.js'

/** Most devices one person can be signed in on at once; signing in on another ends the least recently used. */
const MAX_SESSIONS = 20
/** last_seen_at is only rewritten this often, so ordinary browsing does not write to the database every time. */
const TOUCH_EVERY_MS = 5 * 60_000

/** "Chrome on Windows", "Safari on iPhone": just enough for someone to recognise their own device. */
export function describeDevice(ua: string | undefined): string {
  const s = ua ?? ''
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /SamsungBrowser\//.test(s) ? 'Samsung Internet' : /Chrome\/|CriOS\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}

const sqlTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const toIso = (s: string) => s.replace(' ', 'T') + 'Z'

/**
 * Records a new login and returns its id (which goes into the cookie). With `reuseRecent`, a login the same device made
 * a moment ago is reused: a page that fires several requests at once must not be counted as several devices.
 */
export function createSession(req: Request, userId: number, reuseRecent = false): string {
  const device = describeDevice(req.headers['user-agent'])
  if (reuseRecent) {
    const recent = db
      .prepare("SELECT id FROM sessions WHERE user_id = ? AND device = ? AND ip IS ? AND created_at > datetime('now','-1 minute') ORDER BY created_at DESC LIMIT 1")
      .get(userId, device, req.ip ?? null) as unknown as { id: string } | undefined
    if (recent) return recent.id
  }
  const sv = (db.prepare('SELECT session_version AS sv FROM users WHERE id = ?').get(userId) as unknown as { sv: number } | undefined)?.sv ?? 0
  const id = randomToken(24)
  const expires = sqlTime(Date.now() + config.sessionDays * 86_400_000)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND (expires_at <= datetime(\'now\') OR sv <> ?)').run(userId, sv)
  db.prepare('INSERT INTO sessions (id, user_id, sv, device, ip, expires_at) VALUES (?,?,?,?,?,?)').run(id, userId, sv, device, req.ip ?? null, expires)
  db.prepare(
    `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC, created_at DESC LIMIT ?)`,
  ).run(userId, userId, MAX_SESSIONS)
  return id
}

/** True if this login is still on record (not logged out from elsewhere, not expired). Also keeps last_seen_at fresh. */
export function checkSession(userId: number, sessionId: string, sv: number): boolean {
  const row = db.prepare("SELECT last_seen_at AS seen FROM sessions WHERE id = ? AND user_id = ? AND sv = ? AND expires_at > datetime('now')").get(sessionId, userId, sv) as unknown as
    | { seen: string }
    | undefined
  if (!row) return false
  if (Date.now() - new Date(toIso(row.seen)).getTime() > TOUCH_EVERY_MS) {
    db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(sessionId)
  }
  return true
}

export function endSession(sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

export function listSessions(userId: number, currentId: string | undefined) {
  const rows = db
    .prepare(
      `SELECT s.id, s.device, s.ip, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ? AND s.sv = u.session_version AND s.expires_at > datetime('now')
       ORDER BY s.last_seen_at DESC, s.created_at DESC`,
    )
    .all(userId) as unknown as { id: string; device: string; ip: string | null; createdAt: string; lastSeenAt: string }[]
  return rows.map((r) => ({ id: r.id, device: r.device, ip: r.ip, createdAt: toIso(r.createdAt), lastSeenAt: toIso(r.lastSeenAt), current: r.id === currentId }))
}

/** Logs one device out. Returns false if it is not one of this person's logins. */
export function revokeSession(userId: number, sessionId: string): boolean {
  return Number(db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId).changes) > 0
}

/** Logs out every device except the one making the request. Returns how many were logged out. */
export function revokeOtherSessions(userId: number, keepId: string | undefined): number {
  return Number(db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, keepId ?? '').changes)
}
