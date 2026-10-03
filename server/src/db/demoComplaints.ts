/**
 * Demo complaints for local development and faculty demos (used by `npm run seed`, never by the app itself).
 *
 * About 45 believable complaints over the last five weeks, at every status, each with a full history and
 * notifications, so the dashboards look alive. Deterministic (seeded random) and skipped if data already exists.
 */
import { db, tx } from './connection.js'

type Priority = 'low' | 'medium' | 'high' | 'urgent'

const TEMPLATES: [category: string, text: string, priority: Priority, common?: boolean][] = [
  ['Electrical', 'The ceiling fan is not working at all', 'medium'],
  ['Electrical', 'Tube light keeps flickering and makes a buzzing sound', 'low'],
  ['Electrical', 'The switch board sparks when I plug in my charger', 'urgent'],
  ['Electrical', 'Fan regulator is stuck at full speed', 'low'],
  ['Electrical', 'No power in half of the room, the plug points are dead', 'high'],
  ['Plumbing', 'Water is leaking from the bathroom tap', 'high'],
  ['Plumbing', 'The flush tank keeps running and wastes water', 'medium'],
  ['Plumbing', 'Wash basin drain is completely blocked', 'medium'],
  ['Plumbing', 'The shower head is broken', 'low'],
  ['Furniture', 'My chair leg is broken and it is unsafe to sit on', 'medium'],
  ['Furniture', 'The cupboard door will not close properly', 'low'],
  ['Furniture', 'Study table drawer is jammed', 'low'],
  ['Furniture', 'Bed frame is wobbling and creaks loudly', 'medium'],
  ['Wi-Fi / Internet', 'Wi-Fi keeps disconnecting on our floor', 'medium'],
  ['Wi-Fi / Internet', 'No Wi-Fi signal from the router near my room', 'high'],
  ['Wi-Fi / Internet', 'Internet is extremely slow in the evenings', 'low'],
  ['Cleaning', 'The corridor has not been cleaned for two days', 'medium'],
  ['Cleaning', 'Washroom smells bad and needs deep cleaning', 'high'],
  ['Water Supply', 'There is no hot water in the mornings', 'medium'],
  ['Water Supply', 'Very low water pressure on the third floor', 'high'],
  ['Room Maintenance', 'The window latch is broken and will not lock', 'medium'],
  ['Room Maintenance', 'Paint is peeling off the wall near my bed', 'low'],
  ['Room Maintenance', 'The door lock is stuck and I cannot lock my room', 'high'],
  ['Other', 'The common room TV remote is missing', 'low', true],
  ['Furniture', 'One of the mess hall tables is broken', 'medium', true],
  ['Other', 'Mosquitoes near the staircase, needs fogging', 'low'],
]

const FIX_NOTES: Record<string, string[]> = {
  Electrical: ['Replaced the faulty part and tested it for ten minutes.', 'Rewired the socket and checked the load.'],
  Plumbing: ['Replaced the washer and checked for leaks.', 'Cleared the blockage and flushed the line.'],
  Furniture: ['Repaired the joint and reinforced it.', 'Replaced the broken hinge.'],
  'Wi-Fi / Internet': ['Restarted and re-configured the access point.', 'Replaced the faulty cable and tested the signal.'],
  Cleaning: ['Deep cleaned the area and restocked supplies.'],
  'Water Supply': ['Cleared the valve and the pressure is back to normal.'],
  'Room Maintenance': ['Fixed the fitting and tested it.', 'Repainted the patch.'],
  Other: ['Arranged fogging for the area.'],
}

const STAFF_FOR: Record<string, string> = {
  Electrical: 'ravi.staff@fixnest.demo',
  Plumbing: 'sunil.staff@fixnest.demo',
  'Water Supply': 'sunil.staff@fixnest.demo',
  Cleaning: 'meena.staff@fixnest.demo',
  'Wi-Fi / Internet': 'imran.staff@fixnest.demo',
}

const HOUR = 3_600_000
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const one = <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as unknown as T
const userId = (email: string) => one<{ id: number }>('SELECT id FROM users WHERE email = ?', email).id

export function seedDemoComplaints(studentRows: string[][], staffRows: string[][]) {
  const existing = one<{ n: number }>('SELECT COUNT(*) AS n FROM complaints').n
  if (existing >= 10) {
    console.log(`Found ${existing} complaints already, so no demo complaints were added.`)
    return
  }

  let seed = 20260929
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)]

  const staffIds = staffRows.map(([, email]) => userId(email))
  const adminId = userId('warden@fixnest.demo')
  const students = studentRows.map(([, email, hostel, room]) => {
    const r = one<{ id: number; hostel_id: number }>(
      'SELECT r.id, r.hostel_id FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE h.name = ? AND r.number = ?',
      hostel,
      room,
    )
    return { id: userId(email), roomId: r.id, hostelId: r.hostel_id }
  })
  const categoryId = (name: string) => one<{ id: number }>('SELECT id FROM categories WHERE name = ?', name).id

  const insertComplaint = db.prepare(
    `INSERT INTO complaints (code, student_id, hostel_id, room_id, location_note, category_id, description, priority, status, assigned_staff_id,
       resolution_note, created_at, updated_at, assigned_at, acknowledged_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const insertHistory = db.prepare('INSERT INTO status_history (complaint_id, actor_id, type, from_status, to_status, note, created_at) VALUES (?,?,?,?,?,?,?)')
  const insertNote = db.prepare('INSERT INTO notifications (user_id, complaint_id, title, body, read_at, created_at) VALUES (?,?,?,?,?,?)')

  const now = Date.now()
  const COUNT = 46
  tx(() => {
    for (let i = 0; i < COUNT; i++) {
      const [category, text, priority, common = false] = pick(TEMPLATES)
      const student = pick(students)
      const age = Math.floor(Math.pow(rand(), 1.5) * 35) // days ago, favouring recent
      const created = now - age * 24 * HOUR - Math.floor(rand() * 10 * HOUR) - 2 * HOUR
      const staffEmail = STAFF_FOR[category]
      const staffId = staffEmail ? userId(staffEmail) : pick(staffIds)

      // Older complaints are mostly finished; the newest are still moving.
      const roll = rand()
      let status: string
      if (age > 6) status = roll < 0.74 ? 'fixed' : roll < 0.8 ? 'rejected' : roll < 0.86 ? 'cancelled' : roll < 0.93 ? 'in_progress' : roll < 0.97 ? 'assigned' : 'submitted'
      else if (age > 1) status = roll < 0.28 ? 'fixed' : roll < 0.52 ? 'in_progress' : roll < 0.76 ? 'assigned' : roll < 0.94 ? 'submitted' : 'cancelled'
      else status = roll < 0.4 ? 'submitted' : roll < 0.7 ? 'assigned' : roll < 0.9 ? 'in_progress' : 'fixed'

      const assigned = ['assigned', 'in_progress', 'fixed'].includes(status)
      const assignedAt = assigned ? created + (0.5 + rand() * 6) * HOUR : null
      const ackAt = assigned && status !== 'assigned' ? assignedAt! + (0.2 + rand() * 3) * HOUR : assigned && rand() < 0.4 ? assignedAt! + rand() * 2 * HOUR : null
      const startAt = status === 'in_progress' || status === 'fixed' ? (ackAt ?? assignedAt!) + (0.3 + rand() * 6) * HOUR : null
      const slow = rand() < 0.2
      const fixedAt = status === 'fixed' ? Math.min(startAt! + (1 + rand() * (slow ? 70 : 30)) * HOUR, now - 60_000) : null
      const finalAt = Math.min(now - 1000, fixedAt ?? startAt ?? ackAt ?? assignedAt ?? created)
      const fixNote = status === 'fixed' ? pick(FIX_NOTES[category]) : status === 'rejected' ? 'This is not a maintenance issue. Please contact the mess committee.' : null

      const id = Number(
        insertComplaint.run(
          `TMP-${i}`,
          student.id,
          student.hostelId,
          common ? null : student.roomId,
          common ? pick(['2nd floor corridor', 'Ground floor common room', 'Mess hall']) : null,
          categoryId(category),
          text,
          priority,
          status,
          assigned ? staffId : null,
          fixNote,
          utc(created),
          utc(finalAt),
          assignedAt ? utc(assignedAt) : null,
          ackAt ? utc(ackAt) : null,
          fixedAt ? utc(fixedAt) : null,
        ).lastInsertRowid,
      )
      const code = `HST-${1000 + id}`
      db.prepare('UPDATE complaints SET code = ? WHERE id = ?').run(code, id)

      insertHistory.run(id, student.id, 'status', null, 'submitted', 'Complaint submitted', utc(created))
      insertNote.run(student.id, id, `Complaint ${code} submitted`, 'We received your complaint. You will be notified when it is assigned.', utc(created + 60_000), utc(created))
      if (assigned) {
        insertHistory.run(id, adminId, 'status', 'submitted', 'assigned', 'Assigned to staff', utc(assignedAt!))
        insertNote.run(student.id, id, `${code} assigned`, 'A staff member will handle your complaint.', utc(assignedAt! + 60_000), utc(assignedAt!))
      }
      if (ackAt) insertHistory.run(id, staffId, 'assignment', null, null, 'Staff acknowledged the assignment', utc(ackAt))
      if (startAt) {
        insertHistory.run(id, staffId, 'status', 'assigned', 'in_progress', null, utc(startAt))
        insertNote.run(student.id, id, `Work started on ${code}`, 'Your complaint is being worked on now.', age > 3 ? utc(startAt + 60_000) : null, utc(startAt))
      }
      if (fixedAt) {
        insertHistory.run(id, staffId, 'status', 'in_progress', 'fixed', fixNote, utc(fixedAt))
        insertNote.run(student.id, id, `${code} is fixed`, fixNote!, age > 3 ? utc(fixedAt + 60_000) : null, utc(fixedAt))
      }
      if (status === 'rejected') {
        insertHistory.run(id, adminId, 'status', 'submitted', 'rejected', fixNote, utc(finalAt))
        insertNote.run(student.id, id, `${code} was not accepted`, fixNote!, null, utc(finalAt))
      }
      if (status === 'cancelled') insertHistory.run(id, student.id, 'status', 'submitted', 'cancelled', 'Cancelled by student', utc(finalAt))
    }
  })
  console.log(`Added ${COUNT} demo complaints.`)
}
