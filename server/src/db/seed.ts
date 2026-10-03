/**
 * Demo data for local development and faculty demos. Run with: npm run seed
 * Kept separate from app startup on purpose; refuses to run in production.
 */
import bcrypt from 'bcryptjs'
import { config } from '../config.js'
import { randomToken } from '../lib/security.js'
import { ensureBaseData } from './baseData.js'
import { db, tx } from './connection.js'
import { seedDemoComplaints } from './demoComplaints.js'
import { migrate } from './migrate.js'

if (config.isProd) {
  console.error('Refusing to seed demo data in production.')
  process.exit(1)
}

export const DEMO_PASSWORD = 'Demo@1234'

migrate()
ensureBaseData()

const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
const HOSTELS = [
  { name: 'Boys Hostel A', floors: 3, perFloor: 10 },
  { name: 'Girls Hostel B', floors: 3, perFloor: 10 },
]
const STAFF = [
  ['Ravi Kumar', 'ravi.staff@fixnest.demo', 'Electrician'],
  ['Sunil Patil', 'sunil.staff@fixnest.demo', 'Plumber'],
  ['Meena Shinde', 'meena.staff@fixnest.demo', 'Housekeeping'],
  ['Imran Shaikh', 'imran.staff@fixnest.demo', 'Network / Wi-Fi'],
]
const STUDENTS = [
  ['Aarav Deshmukh', 'aarav@students.fixnest.demo', 'Boys Hostel A', '302'],
  ['Rohan Kulkarni', 'rohan@students.fixnest.demo', 'Boys Hostel A', '104'],
  ['Sneha Joshi', 'sneha@students.fixnest.demo', 'Girls Hostel B', '210'],
  ['Priya Nair', 'priya@students.fixnest.demo', 'Girls Hostel B', '105'],
  ['Kabir Mehta', 'kabir@students.fixnest.demo', 'Boys Hostel A', '205'],
  ['Vikram Singh', 'vikram@students.fixnest.demo', 'Boys Hostel A', '308'],
  ['Ananya Rao', 'ananya@students.fixnest.demo', 'Girls Hostel B', '109'],
  ['Diya Patel', 'diya@students.fixnest.demo', 'Girls Hostel B', '304'],
]

tx(() => {
  const addUser = db.prepare(
    "INSERT OR IGNORE INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)",
  )
  const userId = (email: string) => (db.prepare('SELECT id FROM users WHERE email=?').get(email) as unknown as { id: number }).id

  for (const h of HOSTELS) {
    db.prepare('INSERT OR IGNORE INTO hostels (name) VALUES (?)').run(h.name)
    const hostelId = (db.prepare('SELECT id FROM hostels WHERE name=?').get(h.name) as unknown as { id: number }).id
    for (let floor = 1; floor <= h.floors; floor++) {
      for (let n = 1; n <= h.perFloor; n++) {
        db.prepare('INSERT OR IGNORE INTO rooms (hostel_id,floor,number) VALUES (?,?,?)').run(hostelId, floor, String(floor * 100 + n))
      }
    }
  }

  addUser.run('Warden', 'warden@fixnest.demo', hash, 'warden')
  addUser.run('Admin', 'admin@fixnest.demo', hash, 'admin')

  for (const [name, email, specialty] of STAFF) {
    addUser.run(name, email, hash, 'staff')
    db.prepare('INSERT OR IGNORE INTO staff_profiles (user_id,specialty) VALUES (?,?)').run(userId(email), specialty)
  }

  for (const [name, email, hostel, room] of STUDENTS) {
    addUser.run(name, email, hash, 'student')
    const r = db
      .prepare('SELECT r.id, r.hostel_id FROM rooms r JOIN hostels h ON h.id=r.hostel_id WHERE h.name=? AND r.number=?')
      .get(hostel, room) as unknown as { id: number; hostel_id: number }
    db.prepare('INSERT OR IGNORE INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(userId(email), r.hostel_id, r.id)
  }
})

seedDemoComplaints(STUDENTS, STAFF)

console.log('Demo data ready.')
console.log(`Accounts (password for all: ${DEMO_PASSWORD}):`)
console.log('  admin    admin@fixnest.demo')
console.log('  warden   warden@fixnest.demo')
for (const [, e] of STAFF) console.log(`  staff    ${e}`)
for (const [, e] of STUDENTS) console.log(`  student  ${e}`)
