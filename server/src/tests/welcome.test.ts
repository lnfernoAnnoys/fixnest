/**
 * The welcome email a new student gets. Emails are captured in memory (never sent).
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-welcome-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.RATE_LIMIT_AUTH = '10000'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-welcome-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')
const { setMailSink } = await import('../services/mailer.js')
const { setGoogleVerifier } = await import('../services/google.js')
const { sendWelcomeIfNew } = await import('../services/welcome.js')
const { welcomeEmail, escapeHtml } = await import('../services/emailTemplates.js')

type Sent = { to: string; subject: string; text: string; html?: string; attachments?: { filename: string; path: string; cid?: string }[] }
let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let outbox: Sent[] = []
let failWelcome = false
let identity = { sub: 'g-1', email: 'g1_cs250001@students.isquareit.edu.in', name: 'Gita Rao', picture: null as string | null }

async function post(url: string, body: unknown) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => null)) as any }
}
const settle = () => new Promise((r) => setTimeout(r, 40))
const welcomes = () => outbox.filter((m) => /^Welcome to FixNest/.test(m.subject))

/** Signs a student up with the email code and returns the verify response. */
async function signUpByEmail(email: string, name: string) {
  const reg = await post('/auth/register', { name, email, password: 'Password123', hostelName: 'boys hostel 1', roomNumber: 'm423' })
  assert.equal(reg.status, 201)
  const code = outbox.find((m) => m.to === email && /verification code/.test(m.subject))!.text.match(/\b(\d{6})\b/)![1]
  const done = await post('/auth/verify-email', { email, code })
  await settle()
  return done
}

before(async () => {
  migrate()
  ensureBaseData()
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  setMailSink((m) => {
    if (failWelcome && /^Welcome to FixNest/.test(m.subject)) throw new Error('mail server down')
    outbox.push(m as Sent)
  })
  setGoogleVerifier(async () => identity)
})
beforeEach(() => {
  outbox = []
  failWelcome = false
})
after(() => {
  setMailSink(null)
  setGoogleVerifier(null)
  server.close()
})

describe('the welcome email', () => {
  it('is sent once the email code is confirmed, and not before', async () => {
    const email = 'ana_cs250001@students.isquareit.edu.in'
    const reg = await post('/auth/register', { name: 'Ana Joshi', email, password: 'Password123', hostelName: 'boys hostel 1', roomNumber: 'm423' })
    assert.equal(reg.status, 201)
    await settle()
    assert.equal(welcomes().length, 0, 'nothing yet: the account is not confirmed')
    const code = outbox[0].text.match(/\b(\d{6})\b/)![1]
    const done = await post('/auth/verify-email', { email, code })
    assert.equal(done.status, 200)
    await settle()
    assert.equal(welcomes().length, 1)
    assert.equal(welcomes()[0].to, email)
    assert.equal(welcomes()[0].subject, 'Welcome to FixNest, Ana!')
  })

  it('is a designed HTML email with a plain-text twin, personal details, working links and the logo inside it', async () => {
    await signUpByEmail('bea_cs250002@students.isquareit.edu.in', 'Bea Kulkarni')
    const m = welcomes()[0]
    assert.ok(m.html && m.html.startsWith('<!doctype html>'))
    assert.match(m.html!, /Welcome, Bea/)
    assert.match(m.html!, /Boys Hostel 1 · Room M423/, 'shows where they live')
    assert.ok(m.html!.includes('href="https://fixnest.example/new"'), 'a button straight to the complaint form')
    assert.ok(m.html!.includes('href="https://fixnest.example/privacy"') && m.html!.includes('href="https://fixnest.example/terms"'))
    assert.ok(m.html!.includes('https://fixnest.example/settings'), 'how to turn update emails off')
    assert.match(m.html!, /call the warden or the emergency services/i)
    assert.ok(!/<script|javascript:/i.test(m.html!), 'no scripts')
    assert.ok(!/src="https?:/i.test(m.html!), 'no remote images: nothing to block, nothing that tracks opens')
    // the logo travels inside the email and the HTML refers to it by its content id
    assert.match(m.html!, /src="cid:fixnest-logo"/)
    assert.equal(m.attachments?.length, 1)
    assert.equal(m.attachments![0].cid, 'fixnest-logo')
    assert.ok(fs.statSync(m.attachments![0].path).size > 500, 'the logo file exists')
    // text version
    assert.ok(!/<[a-z][\s\S]*>/i.test(m.text), 'the text version has no HTML')
    assert.match(m.text, /Hi Bea,/)
    assert.match(m.text, /https:\/\/fixnest\.example\/new/)
    assert.match(m.text, /Boys Hostel 1 · Room M423/)
  })

  it('never lets a name or hostel inject HTML', () => {
    const evil = welcomeEmail({ name: '<img src=x onerror=alert(1)> Mallory', hostel: '"><script>x()</script>', room: "A'B", appUrl: 'https://fixnest.example' })
    assert.ok(!evil.html!.includes('<img src=x'))
    assert.ok(!evil.html!.includes('<script>x()'))
    assert.ok(evil.html!.includes('&lt;img'))
    assert.ok(evil.html!.includes('&lt;script&gt;'))
    assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })

  it('also works for someone with no room on record', () => {
    const m = welcomeEmail({ name: 'Cy', hostel: null, room: null, appUrl: 'https://fixnest.example' })
    assert.ok(!m.html!.includes('📍'))
    assert.ok(!m.text.includes('You are set up in'))
    assert.match(m.subject, /Welcome to FixNest, Cy!/)
  })

  it('is sent after a Google sign-up too', async () => {
    identity = { sub: 'g-gita', email: 'gita_cs250003@students.isquareit.edu.in', name: 'Gita Rao', picture: null }
    const first = await post('/auth/google', { credential: 'x'.repeat(30) })
    assert.equal(first.json.needsProfile, true)
    await settle()
    assert.equal(welcomes().length, 0, 'not before they have chosen their room')
    const done = await post('/auth/google/complete', { signupToken: first.json.signupToken, hostelName: 'Boys Hostel 1', roomNumber: 'B-204' })
    assert.equal(done.status, 201)
    await settle()
    assert.equal(welcomes().length, 1)
    assert.equal(welcomes()[0].to, identity.email)
    assert.match(welcomes()[0].html!, /Room B-204/)
  })

  it('is sent only once, however many times it is asked for', async () => {
    const email = 'dev_cs250004@students.isquareit.edu.in'
    const done = await signUpByEmail(email, 'Dev Patil')
    assert.equal(welcomes().length, 1)
    const id = done.json.user.id as number
    sendWelcomeIfNew(id)
    sendWelcomeIfNew(id)
    await settle()
    assert.equal(welcomes().length, 1)
    // logging in again, or with Google later, does not send it again
    const login = await post('/auth/login', { email, password: 'Password123' })
    assert.equal(login.status, 200)
    await settle()
    assert.equal(welcomes().length, 1)
  })

  it('is not sent to staff, wardens or admins', async () => {
    for (const role of ['staff', 'warden', 'admin']) {
      const id = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(`${role} Person`, `${role}-welcome@isquareit.edu.in`, await hashPassword('Password123'), role).lastInsertRowid)
      sendWelcomeIfNew(id)
    }
    await settle()
    assert.equal(welcomes().length, 0)
  })

  it('is not sent to someone who is not confirmed or has been deactivated', async () => {
    const make = async (verified: number, active: number, email: string) =>
      Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified,active) VALUES (?,?,?,?,?,?)').run('Eve Test', email, await hashPassword('Password123'), 'student', verified, active).lastInsertRowid)
    sendWelcomeIfNew(await make(0, 1, 'unconfirmed@students.isquareit.edu.in'))
    sendWelcomeIfNew(await make(1, 0, 'deactivated@students.isquareit.edu.in'))
    await settle()
    assert.equal(welcomes().length, 0)
  })

  it('never breaks the sign-up if the mail server is down', async () => {
    failWelcome = true
    const done = await signUpByEmail('fay_cs250005@students.isquareit.edu.in', 'Fay Nair')
    assert.equal(done.status, 200, 'the account is confirmed and they are logged in regardless')
    assert.equal(done.json.user.email, 'fay_cs250005@students.isquareit.edu.in')
    assert.equal(welcomes().length, 0)
  })

  it('migration 014 marks students who already had accounts as welcomed', () => {
    const sql = fs.readFileSync(new URL('../db/migrations/014_welcome_email.sql', import.meta.url), 'utf8')
    assert.match(sql, /UPDATE users SET welcomed_at = datetime\('now'\) WHERE role = 'student' AND email_verified = 1/)
    const row = db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'welcomed_at'").get() as { n: number }
    assert.equal(row.n, 1)
  })
})
