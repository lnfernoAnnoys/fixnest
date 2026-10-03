import { db } from '../db/connection.js'
import { badRequest } from '../lib/errors.js'

/**
 * Students choose their hostel from the list the admin keeps, and type their room number. The hostel is matched
 * against the real hostels (ignoring capitals, spaces and punctuation) and a student can never add one: only the admin
 * does that, in Setup. A room that does not exist yet is added to the chosen hostel. The limit stops a stream of
 * made-up room numbers from filling the list.
 */
const MAX_ROOMS_PER_HOSTEL = 1000

/** "Boys Hostel-1", "boys hostel 1" and "BOYSHOSTEL1" are the same hostel. */
const sameName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

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

/** "Mithila" or "Mithila or Vikramshila" or "A, B or C": for messages. */
function sayList(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** The hostel a student named, matched against the real ones. It never creates a hostel. */
export function findHostel(text: string): number {
  const hostels = db.prepare('SELECT id, name FROM hostels ORDER BY name').all() as unknown as { id: number; name: string }[]
  const typed = sameName(text)
  const hit = typed ? hostels.find((h) => sameName(h.name) === typed) : undefined
  if (hit) return hit.id
  throw badRequest(
    hostels.length ? `We don't know that hostel. Choose ${sayList(hostels.map((h) => h.name))}.` : 'No hostels have been set up yet. Please ask the hostel office.',
    'UNKNOWN_HOSTEL',
  )
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
    const hostelId = findHostel(input.hostelName)
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
 * Someone who signs up with a hostel and a typed room does not get the room added to the list until their email is
 * verified, so unverified sign-ups cannot fill it with made-up rooms. Call this whenever a student's email becomes verified.
 */
export function finalizeStudentLocation(userId: number) {
  const p = db.prepare('SELECT pending_hostel AS hostel, pending_room AS room FROM student_profiles WHERE user_id = ?').get(userId) as unknown as
    | { hostel: string | null; room: string | null }
    | undefined
  if (!p?.hostel || !p.room) return
  try {
    const { hostelId, roomId } = resolveLocation({ hostelName: p.hostel, roomNumber: p.room })
    db.prepare('UPDATE student_profiles SET hostel_id = ?, room_id = ?, pending_hostel = NULL, pending_room = NULL WHERE user_id = ?').run(hostelId, roomId, userId)
  } catch (e) {
    // The hostel was removed between sign-up and confirming the email. Don't block the confirmation: they can pick
    // their hostel and room again later.
    console.warn('[location] could not place a new student:', e instanceof Error ? e.message : e)
  }
}
