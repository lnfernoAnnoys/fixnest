import { db } from '../db/connection.js'
import { badRequest } from '../lib/errors.js'

/**
 * Students type their hostel name and room number. The names are matched against the hostels that already exist
 * (ignoring capitals, spaces and punctuation), and a new hostel or room is added only when nothing matches.
 * The limits stop a stream of made-up names from filling the lists.
 */
const MAX_HOSTELS = 20
const MAX_ROOMS_PER_HOSTEL = 1000

/** "Boys Hostel-1", "boys hostel 1" and "BOYSHOSTEL1" are the same hostel. */
const sameName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function cleanHostelName(input: string): string {
  const t = input.trim().replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > 60) throw badRequest('Enter your hostel name (2 to 60 characters).', 'VALIDATION')
  if (!/^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/.test(t)) throw badRequest('Use only letters, digits and spaces in the hostel name.', 'VALIDATION')
  // "boys hostel 1" is tidied to "Boys Hostel 1"; names typed with capitals are left as they are.
  return t === t.toLowerCase() ? t.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t
}

/** Room numbers may contain letters, like M423. They are stored in capitals without spaces. */
export function cleanRoomNumber(input: string): string {
  const t = input.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z0-9-]{1,10}$/.test(t)) throw badRequest('Enter your room number, like 302 or M423 (letters and digits only).', 'VALIDATION')
  return t
}

/** A room's floor, worked out from its number (M423 and 423 are on floor 4). The warden can correct it in Setup. */
function guessFloor(number: string): number {
  const digits = number.replace(/\D/g, '')
  return digits.length >= 3 ? Math.min(50, Number(digits.slice(0, -2))) : 0
}

export function findOrCreateHostel(text: string): number {
  const name = cleanHostelName(text)
  const hostels = db.prepare('SELECT id, name FROM hostels').all() as unknown as { id: number; name: string }[]
  const hit = hostels.find((h) => sameName(h.name) === sameName(name))
  if (hit) return hit.id
  if (hostels.length >= MAX_HOSTELS) {
    throw badRequest("We don't know that hostel. Check the name, or ask the warden to add it.", 'UNKNOWN_HOSTEL')
  }
  return Number(db.prepare('INSERT INTO hostels (name) VALUES (?)').run(name).lastInsertRowid)
}

export function findOrCreateRoom(hostelId: number, text: string): number {
  const number = cleanRoomNumber(text)
  const hit = db.prepare('SELECT id FROM rooms WHERE hostel_id = ? AND UPPER(number) = ?').get(hostelId, number) as unknown as { id: number } | undefined
  if (hit) return hit.id
  const count = (db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE hostel_id = ?').get(hostelId) as unknown as { n: number }).n
  if (count >= MAX_ROOMS_PER_HOSTEL) throw badRequest("We don't know that room. Check the number, or ask the warden to add it.", 'UNKNOWN_ROOM')
  return Number(
    db.prepare('INSERT INTO rooms (hostel_id, floor, number) VALUES (?,?,?)').run(hostelId, guessFloor(number), number).lastInsertRowid,
  )
}

/** Turns what a student typed (or picked) into a hostel and room that exist. Call inside a transaction. */
export function resolveLocation(input: { hostelName?: string; roomNumber?: string; hostelId?: number; roomId?: number }): { hostelId: number; roomId: number } {
  if (input.hostelName !== undefined && input.roomNumber !== undefined) {
    const hostelId = findOrCreateHostel(input.hostelName)
    return { hostelId, roomId: findOrCreateRoom(hostelId, input.roomNumber) }
  }
  if (input.hostelId && input.roomId) {
    if (!db.prepare('SELECT 1 FROM rooms WHERE id = ? AND hostel_id = ?').get(input.roomId, input.hostelId)) {
      throw badRequest('Choose a valid hostel and room.', 'VALIDATION')
    }
    return { hostelId: input.hostelId, roomId: input.roomId }
  }
  throw badRequest('Enter your hostel name and room number.', 'VALIDATION')
}

/**
 * Someone who signs up with a typed hostel and room does not get them added to the lists until their email is
 * verified, so unverified sign-ups cannot create hostels. Call this whenever a student's email becomes verified.
 */
export function finalizeStudentLocation(userId: number) {
  const p = db.prepare('SELECT pending_hostel AS hostel, pending_room AS room FROM student_profiles WHERE user_id = ?').get(userId) as unknown as
    | { hostel: string | null; room: string | null }
    | undefined
  if (!p?.hostel || !p.room) return
  const { hostelId, roomId } = resolveLocation({ hostelName: p.hostel, roomNumber: p.room })
  db.prepare('UPDATE student_profiles SET hostel_id = ?, room_id = ?, pending_hostel = NULL, pending_room = NULL WHERE user_id = ?').run(hostelId, roomId, userId)
}
