/**
 * The four roles (student, staff, warden, admin), what a warden may and may not do, that nobody can delete a
 * complaint, and students typing their own hostel name and room number.
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-roles-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.RATE_LIMIT_AUTH = '10000'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-roles-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')
const { setMailSink } = await import('../services/mailer.js')

const PW = 'Password123'
let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let hostelId = 0
let roomId = 0
const ids: Record<string, number> = {}
const cookies: Record<string, string> = {}
let outbox: { to: string; subject: string; text: string }[] = []

async function call(method: string, url: string, who: string | null, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) headers.Cookie = cookies[who]
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(base + url, { method, headers, body: payload })
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] }
}

async function addUser(key: string, role: string, email: string) {
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(`${key} Person`, email, await hashPassword(PW), role).lastInsertRowid)
  if (role === 'student') db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], hostelId, roomId)
  if (role === 'staff') db.prepare('INSERT INTO staff_profiles (user_id,specialty) VALUES (?,?)').run(ids[key], 'Electrician')
  const r = await call('POST', '/auth/login', null, { email, password: PW })
  assert.equal(r.status, 200, `login ${key}`)
  cookies[key] = r.cookie!
}

const newComplaint = async (fields: Record<string, string> = {}) => {
  const fd = new FormData()
  fd.set('categoryId', '1')
  fd.set('description', 'The fan in my room is making a lot of noise')
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return call('POST', '/complaints', 'student', fd)
}

before(async () => {
  migrate()
  ensureBaseData()
  hostelId = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Boys Hostel 1')").run().lastInsertRowid)
  roomId = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelId).lastInsertRowid)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in')
  await addUser('staff', 'staff', 'staff@isquareit.edu.in')
  await addUser('warden', 'warden', 'warden@isquareit.edu.in')
  await addUser('warden2', 'warden', 'warden2@isquareit.edu.in')
  await addUser('admin', 'admin', 'admin@isquareit.edu.in')
  setMailSink((m) => void outbox.push(m))
})

after(() => {
  setMailSink(null)
  server.close()
})

describe('the warden role', () => {
  it('a warden can log in and sees themselves as a warden', async () => {
    const me = await call('GET', '/auth/me', 'warden')
    assert.equal(me.json.user.role, 'warden')
  })

  it('a warden runs the complaints: sees them all, assigns, changes priority, rejects, reads the numbers', async () => {
    const made = await newComplaint()
    const code = made.json.complaint.code
    const list = await call('GET', '/complaints', 'warden')
    assert.ok(list.json.items.some((c: any) => c.code === code))
    assert.equal(list.json.items[0].student.email, 's1@students.isquareit.edu.in', 'wardens see the student email, like admins')
    assert.equal((await call('GET', `/complaints/${code}`, 'warden')).status, 200)
    assert.equal((await call('GET', '/staff', 'warden')).status, 200)
    assert.equal((await call('POST', `/complaints/${code}/assign`, 'warden', { staffId: ids.staff })).status, 200)
    assert.equal((await call('POST', `/complaints/${code}/priority`, 'warden', { priority: 'high' })).status, 200)
    assert.equal((await call('GET', '/stats/overview?days=30', 'warden')).status, 200)
    const fd = new FormData()
    fd.set('status', 'rejected')
    fd.set('note', 'This is not a maintenance issue.')
    assert.equal((await call('POST', `/complaints/${code}/status`, 'warden', fd)).status, 200)
  })

  it('a warden gets the new-complaint alert', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(ids.warden) as any).n
    await newComplaint()
    const after = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(ids.warden) as any).n
    assert.equal(after, before + 1)
  })

  it('a warden looks after students and staff, and can add staff', async () => {
    assert.equal((await call('GET', '/admin/users?role=student', 'warden')).status, 200)
    assert.equal((await call('GET', '/admin/users?role=staff', 'warden')).status, 200)
    const made = await call('POST', '/admin/users', 'warden', { name: 'New Fitter', email: 'fitter@isquareit.edu.in', password: 'Password123', specialty: 'Fitter' })
    assert.equal(made.status, 201)
    assert.equal((await call('PATCH', `/admin/users/${made.json.id}`, 'warden', { active: false })).status, 200)
    assert.equal((await call('POST', `/admin/users/${made.json.id}/reset-password`, 'warden', { password: 'BrandNewPass1' })).status, 200)
  })

  it('a warden can read the hostel list but cannot change the setup: hostels, rooms, categories', async () => {
    assert.equal((await call('GET', '/admin/hostels', 'warden')).status, 200)
    assert.equal((await call('POST', '/admin/hostels', 'warden', { name: 'Sneaky Hostel' })).status, 403)
    assert.equal((await call('PATCH', `/admin/hostels/${hostelId}`, 'warden', { name: 'Renamed' })).status, 403)
    assert.equal((await call('DELETE', `/admin/hostels/${hostelId}`, 'warden')).status, 403)
    assert.equal((await call('POST', `/admin/hostels/${hostelId}/rooms`, 'warden', { floor: 1, number: '999' })).status, 403)
    assert.equal((await call('PATCH', `/admin/rooms/${roomId}`, 'warden', { number: '555' })).status, 403)
    assert.equal((await call('DELETE', `/admin/rooms/${roomId}`, 'warden')).status, 403)
    assert.equal((await call('POST', '/admin/categories', 'warden', { name: 'Pest control' })).status, 403)
    assert.equal((await call('PATCH', '/admin/categories/1', 'warden', { active: false })).status, 403)
  })

  it('a warden cannot see, add or manage wardens, or touch an admin', async () => {
    assert.equal((await call('GET', '/admin/users?role=warden', 'warden')).status, 403)
    assert.equal((await call('POST', '/admin/users', 'warden', { role: 'warden', name: 'Another Warden', email: 'w3@isquareit.edu.in', password: 'Password123' })).status, 403)
    assert.equal((await call('PATCH', `/admin/users/${ids.warden2}`, 'warden', { active: false })).status, 403)
    assert.equal((await call('POST', `/admin/users/${ids.warden2}/reset-password`, 'warden', { password: 'BrandNewPass1' })).status, 403)
    assert.equal((await call('PATCH', `/admin/users/${ids.admin}`, 'warden', { active: false })).status, 403)
    assert.equal((await call('PATCH', `/admin/users/${ids.warden}`, 'warden', { name: 'Me Again' })).status, 403, 'not even their own account here')
  })

  it('students and staff still cannot reach any warden tool', async () => {
    for (const who of ['student', 'staff']) {
      assert.equal((await call('GET', '/admin/users', who)).status, 403, who)
      assert.equal((await call('GET', '/stats/overview', who)).status, 403, who)
      assert.equal((await call('GET', '/staff', who)).status, 403, who)
    }
  })
})

describe('the admin role', () => {
  it('an admin can do everything a warden can, and sets up the system', async () => {
    assert.equal((await call('GET', '/admin/users?role=student', 'admin')).status, 200)
    assert.equal((await call('GET', '/stats/overview', 'admin')).status, 200)
    const made = await call('POST', '/admin/hostels', 'admin', { name: 'Girls Hostel 2' })
    assert.equal(made.status, 201)
    assert.equal((await call('POST', `/admin/hostels/${made.json.id}/rooms`, 'admin', { floor: 1, number: 'M423' })).status, 201)
    assert.equal((await call('POST', '/admin/categories', 'admin', { name: 'Pest control' })).status, 201)
  })

  it('an admin adds, lists and deactivates wardens, and can reset their password', async () => {
    const made = await call('POST', '/admin/users', 'admin', { role: 'warden', name: 'Fresh Warden', email: 'fresh.warden@isquareit.edu.in', password: 'Password123' })
    assert.equal(made.status, 201)
    assert.equal(db.prepare('SELECT role FROM users WHERE id = ?').get(made.json.id)!.role, 'warden')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff_profiles WHERE user_id = ?').get(made.json.id)!.n, 0, 'a warden has no staff profile')
    const list = await call('GET', '/admin/users?role=warden', 'admin')
    assert.ok(list.json.items.some((u: any) => u.email === 'fresh.warden@isquareit.edu.in'))
    assert.equal((await call('POST', `/admin/users/${made.json.id}/reset-password`, 'admin', { password: 'BrandNewPass1' })).status, 200)
    assert.equal((await call('PATCH', `/admin/users/${made.json.id}`, 'admin', { active: false })).status, 200)
    const login = await call('POST', '/auth/login', null, { email: 'fresh.warden@isquareit.edu.in', password: 'BrandNewPass1' })
    assert.equal(login.status, 403, 'a deactivated warden cannot log in')
  })

  it('an admin still cannot change another admin, or themselves, from the People page', async () => {
    assert.equal((await call('PATCH', `/admin/users/${ids.admin}`, 'admin', { active: false })).status, 403)
  })
})

describe('nobody can delete a complaint', () => {
  it('there is no way to delete one, for any role', async () => {
    const made = await newComplaint()
    const code = made.json.complaint.code
    for (const who of ['student', 'staff', 'warden', 'admin']) {
      for (const url of [`/complaints/${code}`, `/admin/complaints/${code}`, `/admin/complaints/${made.json.complaint.id}`]) {
        const status = (await call('DELETE', url, who)).status
        assert.ok(status === 404 || (status === 403 && url.startsWith('/admin') && (who === 'student' || who === 'staff')), `${who} DELETE ${url} gave ${status}`)
      }
      assert.equal((await call('POST', `/complaints/${code}/delete`, who, {})).status, 404, `${who} POST delete`)
    }
    assert.equal((await call('GET', `/complaints/${code}`, 'admin')).status, 200, 'the complaint is still there')
  })

  it('the complaints API has no DELETE route at all, so one cannot be added by accident', async () => {
    const { default: complaintRoutes } = await import('../routes/complaints.js')
    const methods = new Set<string>()
    for (const layer of (complaintRoutes as any).stack) for (const m of Object.keys(layer.route?.methods ?? {})) methods.add(m)
    assert.ok(methods.has('post') && methods.has('get'), 'sanity: the router was inspected')
    assert.ok(!methods.has('delete'), 'no DELETE route on /api/complaints')
  })

  it('removing a hostel or room never removes complaints: it is refused while they exist', async () => {
    await newComplaint()
    assert.equal((await call('DELETE', `/admin/rooms/${roomId}`, 'admin')).status, 409)
    assert.equal((await call('DELETE', `/admin/hostels/${hostelId}`, 'admin')).status, 409)
    assert.ok((db.prepare('SELECT COUNT(*) AS n FROM complaints').get() as any).n >= 3)
  })
})

describe('students type their hostel name and room number', () => {
  const register = (over: Record<string, unknown>) =>
    call('POST', '/auth/register', null, { name: 'Typed Student', email: 'typed@students.isquareit.edu.in', password: 'Password123', ...over })
  const hostels = () => (db.prepare('SELECT name FROM hostels ORDER BY id').all() as any[]).map((h) => h.name)

  it('a room number may contain letters, like M423, and is stored in capitals', async () => {
    outbox = []
    const before = hostels().length
    const r = await register({ hostelName: 'boys hostel 2', roomNumber: 'm 423' })
    assert.equal(r.status, 201)
    assert.equal(hostels().length, before, 'nothing is added to the lists until the email is verified')
    const code = outbox[0].text.match(/\b(\d{6})\b/)![1]
    const v = await call('POST', '/auth/verify-email', null, { email: 'typed@students.isquareit.edu.in', code })
    assert.equal(v.status, 200)
    assert.equal(v.json.user.hostelName, 'Boys Hostel 2', 'a hostel typed in lower case is tidied')
    assert.equal(v.json.user.roomNumber, 'M423')
    assert.equal(hostels().length, before + 1)
    const room = db.prepare("SELECT r.floor FROM rooms r JOIN hostels h ON h.id = r.hostel_id WHERE r.number = 'M423' AND h.name = 'Boys Hostel 2'").get() as any
    assert.equal(room.floor, 4, 'the floor is worked out from the number')
  })

  it('matches an existing hostel however it is typed, instead of making a duplicate', async () => {
    const before = hostels().length
    for (const [i, name] of ['BOYS HOSTEL 1', 'boys-hostel 1', 'Boys  Hostel 1 '].entries()) {
      outbox = []
      const email = `match${i}@students.isquareit.edu.in`
      assert.equal((await register({ email, hostelName: name, roomNumber: '101' })).status, 201)
      const code = outbox[0].text.match(/\b(\d{6})\b/)![1]
      const v = await call('POST', '/auth/verify-email', null, { email, code })
      assert.equal(v.json.user.hostelName, 'Boys Hostel 1', name)
      assert.equal(v.json.user.roomId, roomId, 'and the room that already exists is reused')
    }
    assert.equal(hostels().length, before)
  })

  it('an unverified sign-up never adds a hostel', async () => {
    const before = hostels().length
    assert.equal((await register({ email: 'ghost@students.isquareit.edu.in', hostelName: 'Made Up Hostel', roomNumber: '1' })).status, 201)
    assert.equal(hostels().length, before)
  })

  it('refuses rubbish for a hostel name or room number', async () => {
    assert.equal((await register({ email: 'bad1@students.isquareit.edu.in', hostelName: '<script>', roomNumber: '101' })).status, 400)
    assert.equal((await register({ email: 'bad2@students.isquareit.edu.in', hostelName: 'Boys Hostel 1', roomNumber: 'room 4/23!' })).status, 400)
    assert.equal((await register({ email: 'bad3@students.isquareit.edu.in', hostelName: 'x', roomNumber: '101' })).status, 400)
    assert.equal((await register({ email: 'bad4@students.isquareit.edu.in', hostelName: 'Boys Hostel 1', roomNumber: '' })).status, 400)
    assert.equal((await register({ email: 'bad5@students.isquareit.edu.in' })).status, 400, 'a location is required')
  })

  it('a student reports a problem in another room or a common area by typing the hostel and room', async () => {
    const other = await newComplaint({ hostelName: 'boys hostel 1', roomNumber: 'b-204' })
    assert.equal(other.status, 201)
    assert.equal(other.json.complaint.location.room, 'B-204')
    assert.equal(other.json.complaint.location.hostel, 'Boys Hostel 1')
    const common = await newComplaint({ hostelName: 'Boys Hostel 1', locationNote: '2nd floor washroom' })
    assert.equal(common.status, 201)
    assert.equal(common.json.complaint.location.room, null)
    assert.equal(common.json.complaint.location.note, '2nd floor washroom')
    assert.equal((await newComplaint({ hostelName: 'Boys Hostel 1' })).status, 400, 'a common area needs a description of the place')
  })

  it('caps how many hostels and rooms typed names can create', async () => {
    for (let i = 0; i < 40; i++) db.prepare('INSERT OR IGNORE INTO hostels (name) VALUES (?)').run(`Filler ${i}`)
    const r = await newComplaint({ hostelName: 'Brand New Block', locationNote: 'Corridor' })
    assert.equal(r.status, 400)
    assert.equal(r.json.code, 'UNKNOWN_HOSTEL')
  })
})
