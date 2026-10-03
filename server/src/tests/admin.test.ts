/**
 * Warden tools: people, hostels and rooms, categories, and the overview numbers.
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-admin-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-admin-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')

const PW = 'Password123'
let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let hostelId = 0
let roomId = 0
const ids: Record<string, number> = {}
const cookies: Record<string, string> = {}

async function call(method: string, url: string, who: string | null, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) headers.Cookie = cookies[who]
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] }
}

async function addUser(key: string, role: string, email: string) {
  const hash = await hashPassword(PW)
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(key, email, hash, role).lastInsertRowid)
  if (role === 'student') db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], hostelId, roomId)
  if (role === 'staff') db.prepare('INSERT INTO staff_profiles (user_id, specialty) VALUES (?,?)').run(ids[key], 'Electrician')
  const r = await call('POST', '/auth/login', null, { email, password: PW })
  assert.equal(r.status, 200, `login ${key}`)
  cookies[key] = r.cookie!
}

before(async () => {
  migrate()
  ensureBaseData()
  hostelId = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Test Hostel')").run().lastInsertRowid)
  roomId = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelId).lastInsertRowid)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in')
  await addUser('staff', 'staff', 'a@isquareit.edu.in')
  await addUser('admin', 'admin', 'w@isquareit.edu.in')
  await addUser('admin2', 'admin', 'w2@isquareit.edu.in')
})

after(() => server.close())

describe('access control', () => {
  const endpoints: [string, string][] = [
    ['GET', '/admin/users'],
    ['POST', '/admin/users'],
    ['PATCH', '/admin/users/1'],
    ['POST', '/admin/users/1/reset-password'],
    ['GET', '/admin/hostels'],
    ['POST', '/admin/hostels'],
    ['DELETE', '/admin/hostels/1'],
    ['POST', '/admin/hostels/1/rooms'],
    ['PATCH', '/admin/rooms/1'],
    ['DELETE', '/admin/rooms/1'],
    ['GET', '/admin/categories'],
    ['POST', '/admin/categories'],
    ['PATCH', '/admin/categories/1'],
    ['GET', '/stats/overview'],
  ]
  for (const [method, url] of endpoints) {
    it(`${method} ${url}: nobody signed in gets 401, students and staff get 403`, async () => {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {}
      assert.equal((await call(method, url, null, body)).status, 401)
      assert.equal((await call(method, url, 'student', body)).status, 403)
      assert.equal((await call(method, url, 'staff', body)).status, 403)
    })
  }
})

describe('people', () => {
  it('lists students and staff separately, with search', async () => {
    const students = await call('GET', '/admin/users?role=student', 'admin')
    assert.equal(students.status, 200)
    assert.ok(students.json.items.every((u: any) => u.role === 'student'))
    assert.equal(students.json.items[0].hostel, 'Test Hostel')
    const staff = await call('GET', '/admin/users?role=staff&q=staff', 'admin')
    assert.equal(staff.json.total, 1)
    assert.equal(staff.json.items[0].specialty, 'Electrician')
    assert.equal((await call('GET', '/admin/users?role=admin', 'admin')).status, 400, 'admins are not listed here')
    assert.equal((await call('GET', '/admin/users?q=%25', 'admin')).json.total, 0, 'a % in search is literal, not a wildcard')
  })

  it('creates a staff account that can log in, and refuses duplicates and weak input', async () => {
    const r = await call('POST', '/admin/users', 'admin', { name: 'New Plumber', email: 'Plumber@isquareit.edu.in', password: 'TempPass123', specialty: 'Plumber' })
    assert.equal(r.status, 201)
    const login = await call('POST', '/auth/login', null, { email: 'plumber@isquareit.edu.in', password: 'TempPass123' })
    assert.equal(login.status, 200)
    assert.equal(login.json.user.role, 'staff')
    assert.equal((await call('POST', '/admin/users', 'admin', { name: 'Dup', email: 'plumber@isquareit.edu.in', password: 'TempPass123' })).status, 409)
    assert.equal((await call('POST', '/admin/users', 'admin', { name: 'Weak', email: 'weak@isquareit.edu.in', password: 'short' })).status, 400)
    assert.equal((await call('POST', '/admin/users', 'admin', { name: 'Bad', email: 'not-an-email', password: 'TempPass123' })).status, 400)
  })

  it('deactivating someone blocks their login and their existing session at once', async () => {
    assert.equal((await call('GET', '/auth/me', 'student')).status, 200)
    assert.equal((await call('PATCH', `/admin/users/${ids.student}`, 'admin', { active: false })).status, 200)
    assert.equal((await call('GET', '/auth/me', 'student')).status, 401, 'existing session stops working')
    assert.equal((await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })).status, 403)
    assert.equal((await call('PATCH', `/admin/users/${ids.student}`, 'admin', { active: true })).status, 200)
    const fresh = await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })
    assert.equal(fresh.status, 200)
    cookies.student = fresh.cookie!
  })

  it('cannot change admins or yourself', async () => {
    assert.equal((await call('PATCH', `/admin/users/${ids.admin2}`, 'admin', { active: false })).status, 403)
    assert.equal((await call('PATCH', `/admin/users/${ids.admin}`, 'admin', { active: false })).status, 403)
    assert.equal((await call('POST', `/admin/users/${ids.admin2}/reset-password`, 'admin', { password: 'NewPassword123' })).status, 403)
    assert.equal((await call('PATCH', '/admin/users/99999', 'admin', { active: false })).status, 404)
  })

  it('resets a password', async () => {
    assert.equal((await call('POST', `/admin/users/${ids.staff}/reset-password`, 'admin', { password: 'short' })).status, 400)
    assert.equal((await call('POST', `/admin/users/${ids.staff}/reset-password`, 'admin', { password: 'BrandNewPass1' })).status, 200)
    assert.equal((await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: PW })).status, 401)
    assert.equal((await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'BrandNewPass1' })).status, 200)
    assert.equal((await call('GET', '/auth/me', 'staff')).status, 401, 'their old session ended with the reset')
  })
})

describe('hostels and rooms', () => {
  let newHostel = 0

  it('creates and renames hostels; names are unique', async () => {
    const r = await call('POST', '/admin/hostels', 'admin', { name: 'North Hall' })
    assert.equal(r.status, 201)
    newHostel = r.json.id
    assert.equal((await call('POST', '/admin/hostels', 'admin', { name: 'North Hall' })).status, 409)
    assert.equal((await call('PATCH', `/admin/hostels/${newHostel}`, 'admin', { name: 'Test Hostel' })).status, 409)
    assert.equal((await call('PATCH', `/admin/hostels/${newHostel}`, 'admin', { name: 'North Hall A' })).status, 200)
    assert.equal((await call('POST', '/admin/hostels', 'admin', { name: 'x' })).status, 400)
  })

  it('adds a run of rooms, skipping ones that already exist', async () => {
    const r = await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, from: 101, to: 105 })
    assert.deepEqual([r.status, r.json.created, r.json.skipped.length], [201, 5, 0])
    const again = await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, from: 104, to: 107 })
    assert.deepEqual([again.json.created, again.json.skipped], [2, ['104', '105']])
    assert.equal((await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, from: 10, to: 5 })).status, 400)
    assert.equal((await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, from: 1, to: 500 })).status, 400)
    assert.equal((await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, number: 'bad room!' })).status, 400)
    assert.equal((await call('POST', `/admin/hostels/${newHostel}/rooms`, 'admin', { floor: 1, number: '101' })).status, 409)
  })

  it('lists hostels with room counts', async () => {
    const r = await call('GET', '/admin/hostels', 'admin')
    const north = r.json.hostels.find((h: any) => h.id === newHostel)
    assert.equal(north.rooms.length, 7)
  })

  it('cannot delete a hostel that still has rooms, or a room with students or complaints', async () => {
    assert.equal((await call('DELETE', `/admin/hostels/${newHostel}`, 'admin')).status, 409)
    assert.equal((await call('DELETE', `/admin/rooms/${roomId}`, 'admin')).status, 409, 'has a student living in it')
    const c = db.prepare("INSERT INTO complaints (code,student_id,hostel_id,room_id,category_id,description) VALUES ('HST-9001',?,?,?,1,'x')").run(ids.student, hostelId, roomId)
    assert.ok(c.changes)
  })

  it('deletes an empty room and then the empty hostel', async () => {
    const rooms = (await call('GET', '/admin/hostels', 'admin')).json.hostels.find((h: any) => h.id === newHostel).rooms as any[]
    for (const room of rooms) assert.equal((await call('DELETE', `/admin/rooms/${room.id}`, 'admin')).status, 200)
    assert.equal((await call('DELETE', `/admin/hostels/${newHostel}`, 'admin')).status, 200)
  })
})

describe('categories', () => {
  it('adds, renames and deactivates; students only see active ones', async () => {
    const before = (await call('GET', '/categories', null)).json.categories.length
    const created = await call('POST', '/admin/categories', 'admin', { name: 'Pest control' })
    assert.equal(created.status, 201)
    assert.equal((await call('POST', '/admin/categories', 'admin', { name: 'pest CONTROL' })).status, 409, 'names are unique ignoring case')
    assert.equal((await call('GET', '/categories', null)).json.categories.length, before + 1)
    assert.equal((await call('PATCH', `/admin/categories/${created.json.id}`, 'admin', { name: 'Pests' })).status, 200)
    assert.equal((await call('PATCH', `/admin/categories/${created.json.id}`, 'admin', { active: false })).status, 200)
    assert.equal((await call('GET', '/categories', null)).json.categories.length, before)
  })

  it('a deactivated category cannot be used for a new complaint', async () => {
    const id = (db.prepare("SELECT id FROM categories WHERE name = 'Pests'").get() as { id: number }).id
    const fd = new FormData()
    fd.set('categoryId', String(id))
    fd.set('description', 'There are ants everywhere in my room')
    const res = await fetch(`${base}/complaints`, { method: 'POST', headers: { Cookie: cookies.student }, body: fd })
    assert.equal(res.status, 400)
  })

  it('always keeps at least one category active', async () => {
    const rows = db.prepare('SELECT id FROM categories WHERE active = 1 ORDER BY id').all() as { id: number }[]
    for (const r of rows.slice(0, -1)) assert.equal((await call('PATCH', `/admin/categories/${r.id}`, 'admin', { active: false })).status, 200)
    assert.equal((await call('PATCH', `/admin/categories/${rows.at(-1)!.id}`, 'admin', { active: false })).status, 409)
    for (const r of rows) await call('PATCH', `/admin/categories/${r.id}`, 'admin', { active: true })
  })
})

describe('overview numbers', () => {
  before(() => {
    // A known spread of complaints: 2 open (1 high, 1 urgent & overdue), 1 fixed in 6 hours, 1 fixed long ago.
    db.prepare('DELETE FROM complaints').run()
    const ins = db.prepare(
      `INSERT INTO complaints (code,student_id,hostel_id,room_id,category_id,description,priority,status,created_at,resolved_at)
       VALUES (?,?,?,?,?,'seeded complaint',?,?,?,?)`,
    )
    ins.run('HST-2001', ids.student, hostelId, roomId, 1, 'high', 'submitted', "datetime('now')".replace(/.*/, new Date(Date.now() - 3600_000).toISOString().slice(0, 19).replace('T', ' ')), null)
    ins.run('HST-2002', ids.student, hostelId, roomId, 1, 'urgent', 'in_progress', new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 19).replace('T', ' '), null)
    ins.run('HST-2003', ids.student, hostelId, roomId, 2, 'low', 'fixed', new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 19).replace('T', ' '), new Date(Date.now() - 2 * 86400_000 + 6 * 3600_000).toISOString().slice(0, 19).replace('T', ' '))
    ins.run('HST-2004', ids.student, hostelId, roomId, 3, 'low', 'fixed', new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 19).replace('T', ' '), new Date(Date.now() - 59 * 86400_000).toISOString().slice(0, 19).replace('T', ' '))
  })

  it('reports the current state, independent of the range', async () => {
    const r = await call('GET', '/stats/overview?days=7', 'admin')
    assert.equal(r.status, 200)
    assert.deepEqual(
      [r.json.now.open, r.json.now.unassigned, r.json.now.inProgress, r.json.now.highPriority, r.json.now.overdue, r.json.now.total],
      [2, 1, 1, 2, 1, 4],
    )
  })

  it('scopes the charts to the chosen range and the numbers agree with each other', async () => {
    const r7 = (await call('GET', '/stats/overview?days=7', 'admin')).json.range
    assert.equal(r7.trend.length, 7)
    assert.equal(r7.opened, 3, 'the 60-day-old one is outside the range')
    assert.equal(r7.fixed, 1)
    assert.equal(r7.avgResolutionHours, 6)
    assert.equal(r7.byCategory.reduce((a: number, c: any) => a + c.count, 0), r7.opened)
    assert.deepEqual(r7.byCategory[0], { name: 'Electrical', count: 2 }, 'sorted, biggest first')
    assert.equal(r7.byHostel[0].count, 3)
    assert.equal(r7.trend.reduce((a: number, t: any) => a + t.opened, 0), r7.opened)

    const r90 = (await call('GET', '/stats/overview?days=90', 'admin')).json.range
    assert.equal(r90.trend.length, 90)
    assert.equal(r90.opened, 4)
    assert.equal(r90.fixed, 2)
  })

  it('rejects an invalid range and filters the list by several priorities', async () => {
    assert.equal((await call('GET', '/stats/overview?days=5', 'admin')).status, 400)
    const both = await call('GET', '/complaints?priority=high,urgent&status=open', 'admin')
    assert.equal(both.json.total, 2)
    assert.equal((await call('GET', '/complaints?priority=high;drop', 'admin')).status, 400)
    assert.equal((await call('GET', '/complaints?overdue=1', 'admin')).json.total, 1)
  })
})
