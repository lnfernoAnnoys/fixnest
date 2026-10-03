/**
 * Profile pictures and students changing their own hostel/room.
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-profile-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.RATE_LIMIT_AUTH = '10000'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-profile-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')

const PW = 'Password123'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const GOOGLE_PIC = 'https://lh3.googleusercontent.com/a/pic-of-student'
let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let hostelA = 0
let hostelB = 0
let roomA1 = 0
let roomA2 = 0
let roomB1 = 0
const ids: Record<string, number> = {}
const cookies: Record<string, string> = {}

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
  const type = res.headers.get('content-type') ?? ''
  return {
    status: res.status,
    type,
    json: (type.includes('json') ? await res.json().catch(() => null) : (await res.arrayBuffer(), null)) as any,
    cookie: res.headers.getSetCookie()[0]?.split(';')[0],
  }
}

async function addUser(key: string, role: string, email: string, room: number | null = null, hostel: number | null = null) {
  ids[key] = Number(
    db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(`${key} Person`, email, await hashPassword(PW), role).lastInsertRowid,
  )
  if (role === 'student') db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], hostel, room)
  const r = await call('POST', '/auth/login', null, { email, password: PW })
  assert.equal(r.status, 200, `login ${key}`)
  cookies[key] = r.cookie!
}

const photo = (bytes: Buffer | Uint8Array, name = 'me.png', type = 'image/png') => {
  const fd = new FormData()
  fd.set('image', new Blob([new Uint8Array(bytes)], { type }), name)
  return fd
}
const uploaded = () => (fs.existsSync(process.env.UPLOAD_DIR!) ? fs.readdirSync(process.env.UPLOAD_DIR!) : [])

before(async () => {
  migrate()
  ensureBaseData()
  hostelA = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Hostel A')").run().lastInsertRowid)
  hostelB = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Hostel B')").run().lastInsertRowid)
  roomA1 = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelA).lastInsertRowid)
  roomA2 = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'102')").run(hostelA).lastInsertRowid)
  roomB1 = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,2,'201')").run(hostelB).lastInsertRowid)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in', roomA1, hostelA)
  await addUser('student2', 'student', 's2@students.isquareit.edu.in', roomA1, hostelA)
  await addUser('staff', 'staff', 'staff@isquareit.edu.in')
  await addUser('admin', 'admin', 'w@isquareit.edu.in')
})

after(() => {
  server.close()
  fs.rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true })
})

describe('profile picture', () => {
  it('starts with no picture', async () => {
    const me = await call('GET', '/auth/me', 'student')
    assert.equal(me.json.user.avatarUrl, null)
    assert.equal(me.json.user.customAvatar, false)
  })

  it('needs a login, and a file', async () => {
    assert.equal((await call('POST', '/profile/avatar', null, photo(PNG))).status, 401)
    assert.equal((await call('GET', `/profile/avatar/${ids.student}`, null)).status, 401)
    assert.equal((await call('POST', '/profile/avatar', 'student', new FormData())).status, 400)
  })

  it('accepts a real image, for every kind of account', async () => {
    for (const who of ['student', 'staff', 'admin']) {
      const r = await call('POST', '/profile/avatar', who, photo(PNG))
      assert.equal(r.status, 200, who)
      assert.match(r.json.user.avatarUrl, new RegExp(`^/api/profile/avatar/${ids[who]}\\?v=[A-Za-z0-9_-]{8}$`))
      assert.equal(r.json.user.customAvatar, true)
    }
  })

  it('serves the picture to its owner, and to the warden, but not to other students', async () => {
    const own = await call('GET', `/profile/avatar/${ids.student}`, 'student')
    assert.equal(own.status, 200)
    assert.match(own.type, /image\/png/)
    assert.equal((await call('GET', `/profile/avatar/${ids.student}`, 'admin')).status, 200)
    assert.equal((await call('GET', `/profile/avatar/${ids.student}`, 'student2')).status, 404)
    assert.equal((await call('GET', `/profile/avatar/${ids.student}`, 'staff')).status, 404)
    assert.equal((await call('GET', '/profile/avatar/abc', 'student')).status, 404)
    assert.equal((await call('GET', '/profile/avatar/-1', 'student')).status, 404)
  })

  it('shows up in the warden\'s People list', async () => {
    const r = await call('GET', '/admin/users?role=student', 'admin')
    const me = r.json.items.find((u: any) => u.id === ids.student)
    assert.match(me.avatarUrl, /^\/api\/profile\/avatar\/\d+\?v=/)
  })

  it('rejects files that are not really images, however they are labelled', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    assert.equal((await call('POST', '/profile/avatar', 'student', photo(svg, 'x.png', 'image/png'))).status, 400)
    assert.equal((await call('POST', '/profile/avatar', 'student', photo(PNG, 'x.gif', 'image/gif'))).status, 400)
  })

  it('rejects a picture over 1 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(1_100_000)])
    const r = await call('POST', '/profile/avatar', 'student', photo(big))
    assert.equal(r.status, 400)
    assert.equal(r.json.code, 'FILE_TOO_LARGE')
  })

  it('replacing the picture deletes the old file', async () => {
    const before = await call('GET', '/auth/me', 'student')
    const files = uploaded().length
    const r = await call('POST', '/profile/avatar', 'student', photo(PNG))
    assert.equal(r.status, 200)
    assert.notEqual(r.json.user.avatarUrl, before.json.user.avatarUrl, 'a new upload gets a new address, so it is never served from cache')
    assert.equal(uploaded().length, files, 'the old file is gone')
  })

  it('removing it falls back to the Google photo, then to initials', async () => {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(GOOGLE_PIC, ids.student)
    const files = uploaded().length
    const r = await call('DELETE', '/profile/avatar', 'student')
    assert.equal(r.status, 200)
    assert.equal(r.json.user.avatarUrl, GOOGLE_PIC)
    assert.equal(r.json.user.customAvatar, false)
    assert.equal(uploaded().length, files - 1)
    assert.equal((await call('GET', `/profile/avatar/${ids.student}`, 'student')).status, 404)
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(ids.student)
    assert.equal((await call('GET', '/auth/me', 'student')).json.user.avatarUrl, null)
  })

  it('an uploaded picture wins over the Google photo', async () => {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(GOOGLE_PIC, ids.student2)
    const r = await call('POST', '/profile/avatar', 'student2', photo(PNG))
    assert.match(r.json.user.avatarUrl, /^\/api\/profile\/avatar\//)
  })
})

describe('students changing their hostel and room', () => {
  const move = (who: string, hostelId: unknown, roomId: unknown) => call('PATCH', '/profile/location', who, { hostelId, roomId })

  it('is for students only', async () => {
    assert.equal((await move('staff', hostelA, roomA2)).status, 403)
    assert.equal((await move('admin', hostelA, roomA2)).status, 403)
    assert.equal((await call('PATCH', '/profile/location', null, { hostelId: hostelA, roomId: roomA2 })).status, 401)
  })

  it('only accepts a real room from the list, in the hostel that owns it', async () => {
    assert.equal((await move('student', hostelA, roomB1)).status, 400, 'a room from another hostel')
    assert.equal((await move('student', hostelA, 99999)).status, 400, 'a room that does not exist')
    assert.equal((await move('student', 'Boys Hostel A', '302')).status, 400, 'typed names are not accepted')
    assert.equal((await move('student', hostelA, undefined)).status, 400)
    const same = await move('student', hostelA, roomA1)
    assert.equal(same.status, 400)
    assert.equal(same.json.code, 'SAME_ROOM')
  })

  it('the first change is free and starts a 30-day wait', async () => {
    const me = await call('GET', '/auth/me', 'student')
    assert.equal(me.json.user.roomChangeAllowedAt, null)
    const r = await move('student', hostelB, roomB1)
    assert.equal(r.status, 200)
    assert.equal(r.json.user.hostelName, 'Hostel B')
    assert.equal(r.json.user.roomNumber, '201')
    const days = (new Date(r.json.user.roomChangeAllowedAt).getTime() - Date.now()) / 86_400_000
    assert.ok(days > 29.9 && days <= 30, `waits about 30 days, got ${days}`)
  })

  it('refuses a second change during the wait, and says when it is allowed', async () => {
    const r = await move('student', hostelA, roomA2)
    assert.equal(r.status, 429)
    assert.equal(r.json.code, 'ROOM_CHANGE_COOLDOWN')
    assert.match(r.json.error, /change it again on/)
    assert.equal((await call('GET', '/auth/me', 'student')).json.user.roomNumber, '201', 'nothing changed')
  })

  it('allows another change once 30 days have passed', async () => {
    db.prepare("UPDATE student_profiles SET location_changed_at = datetime('now','-31 days') WHERE user_id = ?").run(ids.student)
    assert.equal((await call('GET', '/auth/me', 'student')).json.user.roomChangeAllowedAt, null)
    const r = await move('student', hostelA, roomA2)
    assert.equal(r.status, 200)
    assert.equal(r.json.user.roomNumber, '102')
    assert.ok(r.json.user.roomChangeAllowedAt)
  })

  it('does not change anyone else, or the room list', async () => {
    assert.equal((await call('GET', '/auth/me', 'student2')).json.user.roomNumber, '101')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rooms').get()!.n, 3)
  })
})
