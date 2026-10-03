/**
 * Google sign-in flow, with Google's servers replaced by a stub.
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

// Isolated database + secret, set before the app modules load.
process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-test-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { setGoogleVerifier } = await import('../services/google.js')
const { hashPassword } = await import('../lib/security.js')

let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let hostelId = 0
let roomId = 0

/** What the stubbed Google returns for the next call. */
let identity: { sub: string; email: string; name: string; picture: string | null } = {
  sub: 'g-1',
  email: 'new_cs250099@students.isquareit.edu.in',
  name: 'New Student',
  picture: 'https://lh3.googleusercontent.com/a/new-student-photo',
}

async function post(url: string, body: unknown, cookie?: string) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] }
}
const get = async (url: string, cookie?: string) => {
  const res = await fetch(base + url, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: res.status, json: (await res.json().catch(() => null)) as any }
}

before(async () => {
  migrate()
  ensureBaseData()
  hostelId = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Test Hostel')").run().lastInsertRowid)
  roomId = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelId).lastInsertRowid)
  const hash = await hashPassword('Password123')
  db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified) VALUES ('Warden','warden@isquareit.edu.in',?,'admin',1)").run(hash)
  db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified,active) VALUES ('Gone','gone@isquareit.edu.in',?,'staff',1,0)").run(hash)
  db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified) VALUES ('Squatter','victim_cs250050@students.isquareit.edu.in',?,'student',0)").run(await hashPassword('AttackerPass1'))
  setGoogleVerifier(async () => identity)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
})

after(() => {
  setGoogleVerifier(null)
  server.close()
})

describe('Google sign-in', () => {
  it('advertises the client id to the login page', async () => {
    const r = await get('/auth/providers')
    assert.equal(r.json.google.clientId, 'test-client.apps.googleusercontent.com')
  })

  it('new college student: first call asks for hostel and room, second creates the account', async () => {
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(first.status, 200)
    assert.equal(first.json.needsProfile, true)
    assert.equal(first.cookie, undefined, 'no session yet')

    const done = await post('/auth/google/complete', { signupToken: first.json.signupToken, hostelId, roomId })
    assert.equal(done.status, 201)
    assert.equal(done.json.user.role, 'student')
    assert.equal(done.json.user.roomNumber, '101')

    const me = await get('/auth/me', done.cookie)
    assert.equal(me.json.user.email, identity.email)
  })

  it('returning student logs straight in', async () => {
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.email, identity.email)
    assert.ok(r.cookie)
  })

  it('a second sign-in does not ask for hostel and room again', async () => {
    const first = await post('/auth/google', { credential: 'x'.repeat(30) }) // logs in, no token
    assert.equal(first.json.needsProfile, undefined)
  })

  it('refuses a new Google account outside the college domain', async () => {
    identity = { sub: 'g-2', email: 'someone@gmail.com', name: 'Outsider', picture: null }
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.status, 403)
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email='someone@gmail.com'").get()!.n, 0)
  })

  it('lets an existing admin in by matching email, and never creates admins', async () => {
    identity = { sub: 'g-3', email: 'warden@isquareit.edu.in', name: 'Warden', picture: null }
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.role, 'admin')
    assert.equal((db.prepare("SELECT google_sub FROM users WHERE email='warden@isquareit.edu.in'").get() as any).google_sub, 'g-3')
  })

  it('does not let a different Google account take over an already-linked email', async () => {
    identity = { sub: 'g-OTHER', email: 'warden@isquareit.edu.in', name: 'Imposter', picture: null }
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.status, 403)
    assert.equal(r.cookie, undefined)
  })

  it('blocks deactivated accounts', async () => {
    identity = { sub: 'g-4', email: 'gone@isquareit.edu.in', name: 'Gone', picture: null }
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.status, 403)
  })

  it('defuses a pre-registered, never-verified account: the squatter password stops working', async () => {
    const before = await post('/auth/login', { email: 'victim_cs250050@students.isquareit.edu.in', password: 'AttackerPass1' })
    assert.equal(before.status, 403, 'unverified accounts cannot log in with a password')
    identity = { sub: 'g-5', email: 'victim_cs250050@students.isquareit.edu.in', name: 'Real Owner', picture: null }
    const viaGoogle = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(viaGoogle.status, 200)
    const after = await post('/auth/login', { email: 'victim_cs250050@students.isquareit.edu.in', password: 'AttackerPass1' })
    assert.equal(after.status, 401, 'attacker password no longer valid')
  })

  it('rejects a tampered or foreign sign-up token', async () => {
    identity = { sub: 'g-6', email: 'another_cs250077@students.isquareit.edu.in', name: 'Another', picture: null }
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    const bad = await post('/auth/google/complete', { signupToken: first.json.signupToken.slice(0, -3) + 'abc', hostelId, roomId })
    assert.equal(bad.status, 400)
  })

  it('the sign-up token cannot be used as a login session', async () => {
    identity = { sub: '1', email: 'third_cs250078@students.isquareit.edu.in', name: 'Third', picture: null }
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    const me = await get('/auth/me', `fixnest_session=${first.json.signupToken}`)
    assert.equal(me.status, 401)
  })

  it('rejects a room that is not in the chosen hostel', async () => {
    identity = { sub: 'g-7', email: 'fourth_cs250079@students.isquareit.edu.in', name: 'Fourth', picture: null }
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    const r = await post('/auth/google/complete', { signupToken: first.json.signupToken, hostelId, roomId: 9999 })
    assert.equal(r.status, 400)
  })
})

describe('Profile pictures and linking Google', () => {
  it('uses the Google picture for a new Google sign-up and shows it in /me', async () => {
    identity = { sub: 'g-pic', email: 'pic_cs250101@students.isquareit.edu.in', name: 'Pic User', picture: 'https://lh3.googleusercontent.com/a/pic-user' }
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    const done = await post('/auth/google/complete', { signupToken: first.json.signupToken, hostelId, roomId })
    assert.equal(done.json.user.avatarUrl, 'https://lh3.googleusercontent.com/a/pic-user')
    assert.equal(done.json.user.googleLinked, 1)
  })

  it('refreshes the picture on later Google logins', async () => {
    identity = { sub: 'g-pic', email: 'pic_cs250101@students.isquareit.edu.in', name: 'Pic User', picture: 'https://lh3.googleusercontent.com/a/pic-user-v2' }
    const r = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(r.json.user.avatarUrl, 'https://lh3.googleusercontent.com/a/pic-user-v2')
  })

  it('rejects a picture URL that is not on a Google image host', async () => {
    const { safePicture } = await import('../services/google.js')
    assert.equal(safePicture('https://evil.example/x.png'), null)
    assert.equal(safePicture('https://notgoogleusercontent.com/x.png'), null)
    assert.equal(safePicture('https://googleusercontent.com.evil.com/x.png'), null)
    assert.equal(safePicture('http://lh3.googleusercontent.com/x.png'), null)
    assert.equal(safePicture('javascript:alert(1)'), null)
    assert.equal(safePicture('https://lh3.googleusercontent.com/a/ok'), 'https://lh3.googleusercontent.com/a/ok')
  })

  it('an email/password account has no picture and no Google link until it connects one', async () => {
    const hash = await hashPassword('Password123')
    db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified) VALUES ('Pw User','pwuser_cs250102@students.isquareit.edu.in',?,'student',1)").run(hash)
    const login = await post('/auth/login', { email: 'pwuser_cs250102@students.isquareit.edu.in', password: 'Password123' })
    assert.equal(login.json.user.avatarUrl, null)
    assert.equal(login.json.user.googleLinked, 0)

    // Connecting the wrong Google account is refused.
    identity = { sub: 'g-wrong', email: 'someoneelse@students.isquareit.edu.in', name: 'Else', picture: null }
    const wrong = await post('/auth/google/link', { credential: 'x'.repeat(30) }, login.cookie)
    assert.equal(wrong.status, 400)

    // Connecting the matching one works and brings the picture.
    identity = { sub: 'g-pw', email: 'pwuser_cs250102@students.isquareit.edu.in', name: 'Pw User', picture: 'https://lh3.googleusercontent.com/a/pw' }
    const ok = await post('/auth/google/link', { credential: 'x'.repeat(30) }, login.cookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.json.user.googleLinked, 1)
    assert.equal(ok.json.user.avatarUrl, 'https://lh3.googleusercontent.com/a/pw')

    // And from now on Google sign-in works for that account.
    const viaGoogle = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(viaGoogle.status, 200)
    assert.equal(viaGoogle.json.user.email, 'pwuser_cs250102@students.isquareit.edu.in')
  })

  it('linking needs a signed-in session, and one Google account cannot be linked twice', async () => {
    identity = { sub: 'g-pw', email: 'pwuser_cs250102@students.isquareit.edu.in', name: 'Pw User', picture: null }
    assert.equal((await post('/auth/google/link', { credential: 'x'.repeat(30) })).status, 401)

    const hash = await hashPassword('Password123')
    db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified) VALUES ('Other','other_cs250103@students.isquareit.edu.in',?,'student',1)").run(hash)
    const other = await post('/auth/login', { email: 'other_cs250103@students.isquareit.edu.in', password: 'Password123' })
    // Same Google identity, but a different email than this account: refused before anything is linked.
    assert.equal((await post('/auth/google/link', { credential: 'x'.repeat(30) }, other.cookie)).status, 400)
  })
})
