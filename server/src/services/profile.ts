import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { badRequest } from '../lib/errors.js'

/** A mobile number: an Indian one (98765 43210, 09876543210, +91 98765 43210) or any international +number. Stored as +CCNNNNNNNNNN. */
export function normalizePhone(input: string): string {
  const t = input.replace(/[\s().-]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(t)) return t
  const indian = t.match(/^(?:91|0)?([6-9]\d{9})$/)
  if (indian) return `+91${indian[1]}`
  throw badRequest('Enter a valid mobile number, like 98765 43210 or +91 98765 43210.', 'VALIDATION')
}

/** When a student may change their hostel or room again, or null if they can do it now. */
export function nextRoomChangeAt(changedAt: string | null): string | null {
  if (!changedAt) return null
  const next = new Date(changedAt.replace(' ', 'T') + 'Z').getTime() + config.roomChangeCooldownDays * 86_400_000
  return next > Date.now() ? new Date(next).toISOString() : null
}

/**
 * The picture to show for a person: the one they uploaded, else their Google photo, else null (the app then
 * shows their initials). The uploaded file's name is in the URL, so a new upload is never served from cache.
 */
export function avatarUrlFor(userId: number, avatarPath: string | null, googleUrl: string | null): string | null {
  if (avatarPath) return `/api/profile/avatar/${userId}?v=${avatarPath.slice(0, 8)}`
  return googleUrl
}

export function deleteAvatarFile(name: string | null) {
  if (!name || !/^[A-Za-z0-9_-]{10,64}\.(jpg|png|webp)$/.test(name)) return
  fs.rmSync(path.join(path.resolve(config.uploadDir), name), { force: true })
}
