/**
 * Forgot password and email notifications. Emails are captured in memory (never sent).
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-mail-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.RATE_LIMIT_AUTH = '10000'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-mail-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword, sha256 } = await import('../lib/security.js')
const { setMailSink } = await import('../services/mailer.js')
const { processEmailQueue } = await import('../services/emailQueue.js')
const { resetLoginGuard } = await import('../services/loginGuard.js')

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

async function addUser(key: string, role: string, email: string, verified = 1) {
  const hash = await hashPassword(PW)
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,?)').run(`${key} Person`, email, hash, role, verified).lastInsertRowid)
  if (role === 'student') db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], hostelId, roomId)
  if (verified) {
    const r = await call('POST', '/auth/login', null, { email, password: PW })
    assert.equal(r.status, 200, `login ${key}`)
    cookies[key] = r.cookie!
  }
}

const tokenFrom = (mail: { text: string }) => mail.text.match(/#token=([A-Za-z0-9_-]+)/)![1]
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Lets a request's fire-and-forget email finish. */
const settle = () => sleepMs(30)

before(async () => {
  migrate()
  ensureBaseData()
  hostelId = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Test Hostel')").run().lastInsertRowid)
  roomId = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelId).lastInsertRowid)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in')
  await addUser('student2', 'student', 's2@students.isquareit.edu.in')
  await addUser('staff', 'staff', 'a@isquareit.edu.in')
  await addUser('admin', 'admin', 'w@isquareit.edu.in')
  setMailSink((m) => void outbox.push(m))
})

beforeEach(() => {
  outbox = []
  resetLoginGuard()
})

after(() => {
  setMailSink(null)
  server.close()
})

describe('forgot password', () => {
  it('gives the same answer for an unknown email as for a real one, and only emails the real one', async () => {
    const unknown = await call('POST', '/auth/forgot-password', null, { email: 'ghost@students.isquareit.edu.in' })
    await settle()
    assert.equal(outbox.length, 0)
    const known = await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    assert.deepEqual([unknown.status, unknown.json], [known.status, known.json])
    assert.equal(outbox.length, 1)
    assert.equal(outbox[0].to, 's1@students.isquareit.edu.in')
    assert.match(outbox[0].text, /^Hi student,/)
    assert.match(outbox[0].text, /https:\/\/fixnest\.example\/reset-password#token=[A-Za-z0-9_-]{40,}/)
    assert.ok(!/reset-password\?/.test(outbox[0].text), 'the token is in the #fragment, which is never sent to servers')
  })

  it('stores only a hash of the token', () => {
    const row = db.prepare('SELECT token_hash FROM password_resets WHERE user_id = ?').get(ids.student) as { token_hash: string }
    assert.match(row.token_hash, /^[0-9a-f]{64}$/)
  })

  it('does not send a second email within a minute', async () => {
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    assert.equal(outbox.length, 0)
  })

  it('rejects a malformed email', async () => {
    assert.equal((await call('POST', '/auth/forgot-password', null, { email: 'not-an-email' })).status, 400)
  })

  it('lets a valid link be checked (masked address) and refuses bad links', async () => {
    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.student)
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    const token = tokenFrom(outbox[0])
    const ok = await call('POST', '/auth/reset-password/check', null, { token })
    assert.equal(ok.status, 200)
    assert.equal(ok.json.email, 's***@students.isquareit.edu.in')
    assert.equal((await call('POST', '/auth/reset-password/check', null, { token: 'x'.repeat(43) })).status, 400)
    assert.equal((await call('POST', '/auth/reset-password/check', null, { token: 'short' })).status, 400)
  })

  it('a newer link replaces the older one', async () => {
    const [{ token_hash: oldHash }] = db.prepare('SELECT token_hash FROM password_resets WHERE user_id = ?').all(ids.student) as { token_hash: string }[]
    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.student)
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    assert.equal(outbox.length, 1)
    const rows = db.prepare('SELECT token_hash FROM password_resets WHERE user_id = ?').all(ids.student) as { token_hash: string }[]
    assert.equal(rows.length, 1)
    assert.notEqual(rows[0].token_hash, oldHash)
    assert.equal(rows[0].token_hash, sha256(tokenFrom(outbox[0])))
  })

  it('refuses a weak new password and keeps the link usable', async () => {
    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.student)
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    const t = tokenFrom(outbox[0])
    assert.equal((await call('POST', '/auth/reset-password', null, { token: t, password: 'short' })).status, 400)
    assert.equal((await call('POST', '/auth/reset-password/check', null, { token: t })).status, 200, 'still valid')
  })

  it('resets the password: new one works, old one does not, old sessions end, link is single-use, lockout is cleared', async () => {
    // lock the account first
    for (let i = 0; i < 10; i++) await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: 'wrong-password' })
    assert.equal((await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })).status, 429)

    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.student)
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    const token = tokenFrom(outbox.at(-1)!)

    assert.equal((await call('GET', '/auth/me', 'student')).status, 200)
    const done = await call('POST', '/auth/reset-password', null, { token, password: 'A-Brand-New-Pass1' })
    assert.equal(done.status, 200)

    assert.equal((await call('GET', '/auth/me', 'student')).status, 401, 'signed out everywhere')
    assert.equal((await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })).status, 401, 'old password is gone')
    const fresh = await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: 'A-Brand-New-Pass1' })
    assert.equal(fresh.status, 200, 'new password works, and the earlier lockout no longer applies')
    cookies.student = fresh.cookie!

    assert.equal((await call('POST', '/auth/reset-password', null, { token, password: 'Another-Pass-2' })).status, 400, 'a link works only once')
    assert.equal((await call('POST', '/auth/reset-password/check', null, { token })).status, 400)
  })

  it('an expired link is refused', async () => {
    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.student)
    await call('POST', '/auth/forgot-password', null, { email: 's1@students.isquareit.edu.in' })
    await settle()
    const token = tokenFrom(outbox.at(-1)!)
    db.prepare('UPDATE password_resets SET expires_at = ? WHERE user_id = ?').run(new Date(Date.now() - 1000).toISOString(), ids.student)
    const r = await call('POST', '/auth/reset-password', null, { token, password: 'Yet-Another-Pass3' })
    assert.equal(r.status, 400)
    assert.equal(r.json.code, 'RESET_INVALID')
  })

  it('a deactivated account gets no email, and a link issued before deactivation stops working', async () => {
    await call('POST', '/auth/forgot-password', null, { email: 'a@isquareit.edu.in' })
    await settle()
    const token = tokenFrom(outbox.at(-1)!)
    assert.equal((await call('PATCH', `/admin/users/${ids.staff}`, 'admin', { active: false })).status, 200)
    assert.equal((await call('POST', '/auth/reset-password', null, { token, password: 'Nope-Nope-123' })).status, 400)
    outbox = []
    db.prepare('UPDATE password_resets SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 120_000).toISOString(), ids.staff)
    await call('POST', '/auth/forgot-password', null, { email: 'a@isquareit.edu.in' })
    await settle()
    assert.equal(outbox.length, 0)
    await call('PATCH', `/admin/users/${ids.staff}`, 'admin', { active: true })
  })

  it('confirms a never-verified account (they proved they own the inbox)', async () => {
    await addUser('pending', 'student', 'pending_cs250200@students.isquareit.edu.in', 0)
    await call('POST', '/auth/forgot-password', null, { email: 'pending_cs250200@students.isquareit.edu.in' })
    await settle()
    const token = tokenFrom(outbox[0])
    assert.equal((await call('POST', '/auth/login', null, { email: 'pending_cs250200@students.isquareit.edu.in', password: PW })).status, 403)
    assert.equal((await call('POST', '/auth/reset-password', null, { token, password: 'Fresh-Start-123' })).status, 200)
    assert.equal((await call('POST', '/auth/login', null, { email: 'pending_cs250200@students.isquareit.edu.in', password: 'Fresh-Start-123' })).status, 200)
  })
})

describe('email notifications: choosing who gets email', () => {
  it('the person who filed a complaint gets an in-app receipt but no email; the warden gets both', async () => {
    const fd = new FormData()
    fd.set('categoryId', '1')
    fd.set('description', 'The ceiling fan is not working at all')
    const created = await call('POST', '/complaints', 'student2', fd)
    assert.equal(created.status, 201)
    const rows = db.prepare('SELECT user_id, title, email_status FROM notifications ORDER BY id').all() as { user_id: number; title: string; email_status: string }[]
    assert.equal(rows.find((r) => r.user_id === ids.student2)!.email_status, 'skipped')
    assert.equal(rows.find((r) => r.user_id === ids.admin)!.email_status, 'pending')
  })

  it('people can switch emails off; the in-app notification still appears', async () => {
    assert.equal((await call('PATCH', '/auth/preferences', 'student2', { emailNotifications: 'no' })).status, 400, 'must be true or false')
    assert.equal((await call('PATCH', '/auth/preferences', null, { emailNotifications: false })).status, 401)
    const off = await call('PATCH', '/auth/preferences', 'student2', { emailNotifications: false })
    assert.equal(off.status, 200)
    assert.equal(off.json.user.emailNotifications, 0)
    const code = (db.prepare("SELECT code FROM complaints WHERE student_id = ? ORDER BY id DESC LIMIT 1").get(ids.student2) as { code: string }).code
    await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: ids.staff })
    const mine = db.prepare('SELECT title, email_status FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(ids.student2) as { title: string; email_status: string }
    assert.match(mine.title, /assigned/)
    assert.equal(mine.email_status, 'skipped')
    const theirs = (await call('GET', '/notifications', 'student2')).json.items
    assert.ok(theirs.some((n: any) => /assigned/.test(n.title)), 'still visible in the app')
    const staffRow = db.prepare('SELECT email_status FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(ids.staff) as { email_status: string }
    assert.equal(staffRow.email_status, 'pending', 'other people are unaffected')
    await call('PATCH', '/auth/preferences', 'student2', { emailNotifications: true })
  })

  it('nobody is emailed about the past: notifications that existed before are never sent', () => {
    const skipped = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE email_status = 'skipped'").get() as { n: number }
    assert.ok(skipped.n >= 1)
  })
})

describe('email notifications: sending', () => {
  it('sends each queued email once, with the complaint link and an off switch', async () => {
    outbox = []
    const result = await processEmailQueue()
    assert.ok(result.sent >= 2)
    const toStaff = outbox.find((m) => m.to === 'a@isquareit.edu.in')!
    assert.match(toStaff.subject, /^\[FixNest\] New assignment HST-\d+$/)
    assert.match(toStaff.text, /^Hi staff,/)
    assert.match(toStaff.text, /View HST-\d+: https:\/\/fixnest\.example\/complaints\/HST-\d+/)
    assert.match(toStaff.text, /https:\/\/fixnest\.example\/settings/)
    const again = await processEmailQueue()
    assert.equal(again.sent, 0, 'nothing is sent twice')
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE email_status = 'pending'").get() as { n: number }).n, 0)
  })

  it('retries a failed send later instead of losing it, and eventually gives up', async () => {
    const fd = new FormData()
    fd.set('categoryId', '2')
    fd.set('description', 'The bathroom tap is leaking badly')
    await call('POST', '/complaints', 'student', fd)
    outbox = []
    setMailSink(() => {
      throw new Error('SMTP is down')
    })
    const first = await processEmailQueue()
    assert.ok(first.failed >= 1)
    const row = db.prepare("SELECT id, email_status, email_attempts, email_next_at, email_error FROM notifications WHERE email_error IS NOT NULL LIMIT 1").get() as any
    assert.equal(row.email_status, 'pending')
    assert.equal(row.email_attempts, 1)
    assert.match(row.email_error, /SMTP is down/)
    assert.ok(Date.parse(row.email_next_at) > Date.now(), 'retry is scheduled for later')

    assert.deepEqual(await processEmailQueue(), { sent: 0, failed: 0 }, 'not due yet, so not retried yet')

    // Mail server comes back: the next round delivers it.
    setMailSink((m) => void outbox.push(m))
    db.prepare("UPDATE notifications SET email_next_at = ? WHERE email_status = 'pending'").run(new Date(Date.now() - 1000).toISOString())
    const retry = await processEmailQueue()
    assert.ok(retry.sent >= 1)
    assert.ok(outbox.length >= 1)

    // A permanently broken address is given up on after 5 tries.
    db.prepare("INSERT INTO notifications (user_id, title, body, email_status, email_attempts) VALUES (?, 'Hello', 'Test', 'pending', 4)").run(ids.admin)
    setMailSink(() => {
      throw new Error('mailbox does not exist')
    })
    await processEmailQueue()
    const dead = db.prepare("SELECT email_status, email_attempts FROM notifications WHERE title = 'Hello'").get() as any
    assert.deepEqual([dead.email_status, dead.email_attempts], ['failed', 5])
    setMailSink((m) => void outbox.push(m))
  })
})
