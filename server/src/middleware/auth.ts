import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { db } from '../db/connection.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { checkSession, createSession } from '../services/sessions.js'

/**
 * student: files complaints. staff: fixes them. warden: runs the hostel day to day (assigns work, looks after students and staff).
 * admin: runs the system, and can do everything a warden can plus set up wardens, hostels, rooms and categories.
 */
export type Role = 'student' | 'staff' | 'warden' | 'admin'
/** Wardens and admins: the people who see every complaint and hand out the work. */
export const isManager = (role: Role) => role === 'warden' || role === 'admin'
export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    /** Which of the person's logins (devices) this request came from. */
    sessionId?: string
  }
}

export const COOKIE = 'fixnest_session'

/** Signs the person in on this device: records the login (so it shows under Active devices) and sets the cookie. */
export function setSessionCookie(req: Request, res: Response, userId: number, reuseRecent = false) {
  const row = db.prepare('SELECT session_version AS sv FROM users WHERE id = ?').get(userId) as unknown as { sv: number } | undefined
  const sid = createSession(req, userId, reuseRecent)
  const token = jwt.sign({ sub: userId, kind: 'session', sv: row?.sv ?? 0, sid }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  })
}

/** Loads the user on every request, so deactivated users lose access immediately. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE]
  if (!token) return next(unauthorized())
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as { sub: number; kind?: string; sv?: number; sid?: string }
    // Other signed tokens (e.g. the Google sign-up token) must never work as a login session.
    if (payload.kind !== 'session') return next(unauthorized())
    const user = db
      .prepare('SELECT id, name, email, role, session_version AS sv FROM users WHERE id=? AND active=1 AND email_verified=1')
      .get(payload.sub) as unknown as (AuthUser & { sv: number }) | undefined
    // A password reset or deactivation bumps the version, which ends every session issued before it.
    if (!user || (payload.sv ?? 0) !== user.sv) return next(unauthorized())
    if (payload.sid) {
      // Logged out from another device (or expired)? Then this login no longer counts.
      if (!checkSession(user.id, payload.sid, user.sv)) return next(unauthorized('You were logged out. Please log in again.'))
      req.sessionId = payload.sid
    } else if (config.isProd) {
      // A login from before devices were tracked can't be listed or logged out, so a live site does not accept it.
      return next(unauthorized('Your session expired. Please log in again.'))
    } else {
      // Development: adopt it, so nobody is signed out by the update.
      setSessionCookie(req, res, user.id, true)
    }
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role }
    next()
  } catch {
    next(unauthorized('Your session expired. Please log in again.'))
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : next(forbidden())
