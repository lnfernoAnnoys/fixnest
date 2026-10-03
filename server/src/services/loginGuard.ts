import { HttpError } from '../lib/errors.js'

/**
 * Per-account brake on password guessing, on top of the per-IP rate limit (which a spread-out attacker can dodge).
 * After MAX wrong attempts for one email, further attempts are refused until the window passes, even with the
 * right password. Kept in memory: it resets on restart, which is fine for a brake (not a permanent ban).
 */
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60_000
const attempts = new Map<string, { count: number; since: number }>()

function prune() {
  const now = Date.now()
  for (const [k, v] of attempts) if (now - v.since >= WINDOW_MS) attempts.delete(k)
}

export function assertNotLocked(email: string) {
  const a = attempts.get(email)
  if (!a) return
  const left = WINDOW_MS - (Date.now() - a.since)
  if (left <= 0) return void attempts.delete(email)
  if (a.count >= MAX_ATTEMPTS) {
    throw new HttpError(429, `Too many wrong passwords. Try again in ${Math.ceil(left / 60_000)} minute(s), or use Google sign-in.`, 'LOCKED')
  }
}

/** Counts a failure for any email (existing or not) so the response never reveals which accounts exist. */
export function recordFailure(email: string) {
  if (attempts.size > 5000) prune()
  const now = Date.now()
  const a = attempts.get(email)
  if (!a || now - a.since >= WINDOW_MS) attempts.set(email, { count: 1, since: now })
  else a.count++
}

export function clearFailures(email: string) {
  attempts.delete(email)
}

/** For tests only. */
export function resetLoginGuard() {
  attempts.clear()
}
