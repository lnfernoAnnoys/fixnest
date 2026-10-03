/**
 * Active devices (see where you are logged in, log a device out) and the mobile number.
 * Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-devices-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.APP_URL = 'https://fixnest.example'
process.env.RATE_LIMIT_AUTH = '10000'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-devices-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')
const { describeDevice } = await import('../services/sessions.js')
const { resetLoginGuard } = await import('../services/loginGuard.js')
const { default: jwt } = await import('jsonwebtoken')
const { config } = await import('../config.js')

const PW = 'Password123'
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
let base = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
const ids: Record<string, number> = {}

async function call(method: string, url: string, cookie: string | null, body?: unknown, ua?: string) {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = cookie
  if (ua) headers['User-Agent'] = ua
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => null)) as any, cookie: res.headers.getSetCookie()[0]?.split(';')[0] }
}

/** Logs in like a browser would and returns that device's cookie. */
async function loginFrom(email: string, ua: string) {
  resetLoginGuard()
  const r = await call('POST', '/auth/login', null, { email, password: PW }, ua)
  assert.equal(r.status, 200)
  return r.cookie!
}

async function addUser(key: string, role: string, email: string) {
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(`${key} Person`, email, await hashPassword(PW), role).lastInsertRowid)
}

before(async () => {
  migrate()
  ensureBaseData()
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('ana', 'student', 'ana@students.isquareit.edu.in')
  await addUser('ben', 'student', 'ben@students.isquareit.edu.in')
})

after(() => server.close())

describe('describing a device', () => {
  it('turns a browser string into something a person recognises', () => {
    assert.equal(describeDevice(CHROME_WIN), 'Chrome on Windows')
    assert.equal(describeDevice(SAFARI_IPHONE), 'Safari on iPhone')
    assert.equal(describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36'), 'Chrome on Android')
    assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'), 'Edge on Windows')
    assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0'), 'Firefox on macOS')
    assert.equal(describeDevice(undefined), 'Unknown device')
  })
})

describe('active devices', () => {
  let laptop = ''
  let phone = ''

  it('needs a login', async () => {
    assert.equal((await call('GET', '/auth/sessions', null)).status, 401)
    assert.equal((await call('POST', '/auth/sessions/revoke-others', null)).status, 401)
    assert.equal((await call('DELETE', '/auth/sessions/abc', null)).status, 401)
  })

  it('lists each login, marking the one you are using', async () => {
    laptop = await loginFrom('ana@students.isquareit.edu.in', CHROME_WIN)
    phone = await loginFrom('ana@students.isquareit.edu.in', SAFARI_IPHONE)
    const fromLaptop = await call('GET', '/auth/sessions', laptop)
    assert.equal(fromLaptop.status, 200)
    assert.equal(fromLaptop.json.sessions.length, 2)
    assert.deepEqual(fromLaptop.json.sessions.map((s: any) => [s.device, s.current]).sort(), [['Chrome on Windows', true], ['Safari on iPhone', false]])
    const s = fromLaptop.json.sessions[0]
    assert.match(s.lastSeenAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
    assert.ok(!('user_id' in s) && !('sv' in s), 'nothing internal is shown')
    const fromPhone = await call('GET', '/auth/sessions', phone)
    assert.deepEqual(fromPhone.json.sessions.find((x: any) => x.current).device, 'Safari on iPhone')
  })

  it('never shows anyone else\'s devices, and cannot log them out', async () => {
    const bens = await loginFrom('ben@students.isquareit.edu.in', CHROME_WIN)
    const list = await call('GET', '/auth/sessions', bens)
    assert.equal(list.json.sessions.length, 1)
    const anasId = (await call('GET', '/auth/sessions', laptop)).json.sessions.find((x: any) => !x.current).id
    assert.equal((await call('DELETE', `/auth/sessions/${anasId}`, bens)).status, 404)
    assert.equal((await call('GET', '/auth/me', phone)).status, 200, 'her phone is still logged in')
  })

  it('logging a device out ends that login at once, and only that one', async () => {
    const phoneId = (await call('GET', '/auth/sessions', laptop)).json.sessions.find((x: any) => !x.current).id
    assert.equal((await call('DELETE', `/auth/sessions/${phoneId}`, laptop)).status, 200)
    const gone = await call('GET', '/auth/me', phone)
    assert.equal(gone.status, 401)
    assert.match(gone.json.error, /logged out/i)
    assert.equal((await call('GET', '/auth/me', laptop)).status, 200)
    assert.equal((await call('GET', '/auth/sessions', laptop)).json.sessions.length, 1)
    assert.equal((await call('DELETE', `/auth/sessions/${phoneId}`, laptop)).status, 404, 'already gone')
  })

  it('"log out everywhere else" keeps only this device', async () => {
    const a = await loginFrom('ana@students.isquareit.edu.in', SAFARI_IPHONE)
    const b = await loginFrom('ana@students.isquareit.edu.in', 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0')
    const r = await call('POST', '/auth/sessions/revoke-others', laptop)
    assert.equal(r.status, 200)
    assert.equal(r.json.loggedOut, 2)
    assert.equal((await call('GET', '/auth/me', a)).status, 401)
    assert.equal((await call('GET', '/auth/me', b)).status, 401)
    assert.equal((await call('GET', '/auth/me', laptop)).status, 200)
    assert.equal((await call('GET', '/auth/sessions', laptop)).json.sessions.length, 1)
  })

  it('logging out ends the login for good: a copied cookie stops working', async () => {
    const copy = await loginFrom('ana@students.isquareit.edu.in', CHROME_WIN)
    assert.equal((await call('GET', '/auth/me', copy)).status, 200)
    assert.equal((await call('POST', '/auth/logout', copy)).status, 200)
    assert.equal((await call('GET', '/auth/me', copy)).status, 401, 'replaying the old cookie fails')
  })

  it('a password reset or deactivation logs out every device', async () => {
    const one = await loginFrom('ben@students.isquareit.edu.in', CHROME_WIN)
    db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(ids.ben)
    assert.equal((await call('GET', '/auth/me', one)).status, 401)
    const fresh = await loginFrom('ben@students.isquareit.edu.in', SAFARI_IPHONE)
    const list = await call('GET', '/auth/sessions', fresh)
    assert.equal(list.json.sessions.length, 1, 'the old logins are not listed as if they were still active')
  })

  it('a login from before devices were tracked is adopted, not signed out, and counted once', async () => {
    const legacy = jwt.sign({ sub: ids.ana, kind: 'session', sv: 0 }, config.jwtSecret, { expiresIn: '1d' })
    const cookie = `fixnest_session=${legacy}`
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(ids.ana)
    const results = await Promise.all([1, 2, 3].map(() => call('GET', '/auth/me', cookie, undefined, CHROME_WIN)))
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200])
    assert.ok(results[0].cookie?.startsWith('fixnest_session='), 'it is given a tracked login')
    assert.equal((await call('GET', '/auth/sessions', results[0].cookie!)).json.sessions.length, 1, 'three parallel requests are one device')
  })

  it('keeps at most 20 logins per person, dropping the least recently used', async () => {
    for (let i = 0; i < 24; i++) await loginFrom('ben@students.isquareit.edu.in', CHROME_WIN)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(ids.ben) as any).n, 20)
  })
})

describe('mobile number', () => {
  let cookie = ''
  before(async () => {
    cookie = await loginFrom('ana@students.isquareit.edu.in', CHROME_WIN)
  })

  it('needs a login', async () => {
    assert.equal((await call('PATCH', '/profile/phone', null, { phone: '9876543210' })).status, 401)
  })

  it('starts empty', async () => {
    assert.equal((await call('GET', '/auth/me', cookie)).json.user.phone, null)
  })

  it('saves Indian numbers in any usual format as +91 and ten digits', async () => {
    for (const typed of ['9876543210', '98765 43210', '09876543210', '+91 98765 43210', '+91-98765-43210', '91 9876543210', '(98765) 43210']) {
      const r = await call('PATCH', '/profile/phone', cookie, { phone: typed })
      assert.equal(r.status, 200, typed)
      assert.equal(r.json.user.phone, '+919876543210', typed)
    }
    assert.equal((await call('GET', '/auth/me', cookie)).json.user.phone, '+919876543210')
  })

  it('also accepts an international number', async () => {
    assert.equal((await call('PATCH', '/profile/phone', cookie, { phone: '+44 7911 123456' })).json.user.phone, '+447911123456')
  })

  it('refuses things that are not a mobile number', async () => {
    for (const bad of ['12345', '5876543210', '98765 4321', 'call me', '98765abcde', '+0123456789', '9'.repeat(31)]) {
      const r = await call('PATCH', '/profile/phone', cookie, { phone: bad })
      assert.equal(r.status, 400, bad)
    }
    assert.equal((await call('PATCH', '/profile/phone', cookie, {})).status, 400)
    assert.equal((await call('GET', '/auth/me', cookie)).json.user.phone, '+447911123456', 'the saved number did not change')
  })

  it('a blank number removes it', async () => {
    const r = await call('PATCH', '/profile/phone', cookie, { phone: '  ' })
    assert.equal(r.status, 200)
    assert.equal(r.json.user.phone, null)
  })

  it('only ever changes your own number', async () => {
    const before = db.prepare('SELECT phone FROM users WHERE id = ?').get(ids.ben) as any
    await call('PATCH', '/profile/phone', cookie, { phone: '9123456780', userId: ids.ben })
    assert.deepEqual(db.prepare('SELECT phone FROM users WHERE id = ?').get(ids.ben), before)
  })
})
