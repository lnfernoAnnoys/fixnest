/**
 * Security regression tests: who can reach what, sessions, brute-force limits, uploads, headers,
 * production safeguards, and the static-file server. Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-sec-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH = '10000' // the per-address limit is real; these tests make hundreds of logins from one address
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-sec-uploads-${process.pid}`)

const { createApp } = await import('../app.js')
const { migrate } = await import('../db/migrate.js')
const { ensureBaseData } = await import('../db/baseData.js')
const { db } = await import('../db/connection.js')
const { hashPassword } = await import('../lib/security.js')
const { resetLoginGuard } = await import('../services/loginGuard.js')

const PW = 'Password123'
const SERVER_DIR = path.resolve(import.meta.dirname, '../..')
const fileUrl = (rel: string) => pathToFileURL(path.join(SERVER_DIR, rel)).href
let base = ''
let root = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
const ids: Record<string, number> = {}
const cookies: Record<string, string> = {}

async function call(method: string, url: string, who: string | null, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra }
  if (who) headers.Cookie = cookies[who]
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(base + url, { method, headers, body: payload })
  return { status: res.status, json: (await res.json().catch(() => null)) as any, res, cookie: res.headers.getSetCookie()[0]?.split(';')[0] }
}

async function addUser(key: string, role: string, email: string) {
  const hash = await hashPassword(PW)
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(key, email, hash, role).lastInsertRowid)
  if (role === 'student') {
    const h = Number(db.prepare("INSERT OR IGNORE INTO hostels (name) VALUES ('H')").run().lastInsertRowid) || (db.prepare("SELECT id FROM hostels WHERE name='H'").get() as any).id
    const r = Number(db.prepare("INSERT OR IGNORE INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(h).lastInsertRowid) || (db.prepare("SELECT id FROM rooms WHERE number='101'").get() as any).id
    db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], h, r)
  }
  const r = await call('POST', '/auth/login', null, { email, password: PW })
  assert.equal(r.status, 200, `login ${key}`)
  cookies[key] = r.cookie!
}

before(async () => {
  migrate()
  ensureBaseData()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixnest-static-'))
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in')
  await addUser('staff', 'staff', 'a@isquareit.edu.in')
  await addUser('admin', 'admin', 'w@isquareit.edu.in')
})

after(() => {
  server.close()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('every endpoint is private unless it is meant to be public', () => {
  const PUBLIC: [string, string][] = [
    ['GET', '/health'],
    ['GET', '/hostels'],
    ['GET', '/categories'],
    ['GET', '/auth/providers'],
    ['POST', '/auth/logout'],
  ]
  const PRIVATE: [string, string][] = [
    ['GET', '/auth/me'],
    ['POST', '/auth/google/link'],
    ['GET', '/complaints'],
    ['GET', '/complaints/summary'],
    ['POST', '/complaints'],
    ['GET', '/complaints/HST-1001'],
    ['POST', '/complaints/HST-1001/cancel'],
    ['POST', '/complaints/HST-1001/notes'],
    ['POST', '/complaints/HST-1001/acknowledge'],
    ['POST', '/complaints/HST-1001/status'],
    ['POST', '/complaints/HST-1001/assign'],
    ['POST', '/complaints/HST-1001/priority'],
    ['POST', '/complaints/HST-1001/reopen'],
    ['GET', '/notifications'],
    ['POST', '/notifications/read-all'],
    ['POST', '/notifications/1/read'],
    ['GET', '/files/abcdefghijkl.png'],
    ['GET', '/staff'],
    ['GET', '/stats/overview'],
    ['GET', '/admin/users'],
    ['GET', '/admin/hostels'],
    ['GET', '/admin/categories'],
  ]
  for (const [method, url] of PRIVATE) {
    it(`${method} ${url} needs a login`, async () => {
      const r = await call(method, url, null, method === 'GET' ? undefined : {})
      assert.equal(r.status, 401)
    })
  }
  for (const [method, url] of PUBLIC) {
    it(`${method} ${url} is public and reveals no personal data`, async () => {
      const r = await call(method, url, null, method === 'GET' ? undefined : {})
      assert.ok(r.status < 400 || r.status === 404, `unexpected ${r.status}`)
      assert.ok(!JSON.stringify(r.json).match(/password|email/i) || url.includes('providers'), 'no secrets in a public response')
    })
  }
})

describe('sessions', () => {
  it('cookie is httpOnly and SameSite=Lax', async () => {
    const r = await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })
    const setCookie = r.res.headers.getSetCookie()[0]
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
  })

  it('a password reset by the warden signs the person out everywhere', async () => {
    assert.equal((await call('GET', '/auth/me', 'staff')).status, 200)
    assert.equal((await call('POST', `/admin/users/${ids.staff}/reset-password`, 'admin', { password: 'BrandNewPass1' })).status, 200)
    assert.equal((await call('GET', '/auth/me', 'staff')).status, 401, 'the old session no longer works')
    const again = await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'BrandNewPass1' })
    assert.equal(again.status, 200)
    cookies.staff = again.cookie!
    assert.equal((await call('GET', '/auth/me', 'staff')).status, 200, 'a fresh login works')
  })

  it('deactivating someone ends their open session', async () => {
    assert.equal((await call('PATCH', `/admin/users/${ids.student}`, 'admin', { active: false })).status, 200)
    assert.equal((await call('GET', '/auth/me', 'student')).status, 401)
    await call('PATCH', `/admin/users/${ids.student}`, 'admin', { active: true })
    assert.equal((await call('GET', '/auth/me', 'student')).status, 401, 'reactivating does not resurrect the old session')
    const fresh = await call('POST', '/auth/login', null, { email: 's1@students.isquareit.edu.in', password: PW })
    cookies.student = fresh.cookie!
    assert.equal((await call('GET', '/auth/me', 'student')).status, 200)
  })

  it('a forged or unsigned token is rejected', async () => {
    const forge = (secret: string) => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const head = b64({ alg: 'HS256', typ: 'JWT' })
      const body = b64({ sub: ids.admin, kind: 'session', sv: 0, exp: Math.floor(Date.now() / 1000) + 3600 })
      return `${head}.${body}.${crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
    }
    const wrong = await fetch(`${base}/auth/me`, { headers: { Cookie: `fixnest_session=${forge('not-the-real-secret')}` } })
    assert.equal(wrong.status, 401)
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: ids.admin, kind: 'session' })).toString('base64url')}.`
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Cookie: `fixnest_session=${none}` } })).status, 401)
  })
})

describe('password guessing', () => {
  it('locks an account after 10 wrong passwords, even for the right one, and reveals nothing about which emails exist', async () => {
    resetLoginGuard()
    const real = 's1@students.isquareit.edu.in'
    const ghost = 'nobody-here@students.isquareit.edu.in'
    for (let i = 0; i < 10; i++) {
      assert.equal((await call('POST', '/auth/login', null, { email: real, password: 'wrong-password' })).status, 401)
      assert.equal((await call('POST', '/auth/login', null, { email: ghost, password: 'wrong-password' })).status, 401)
    }
    const lockedReal = await call('POST', '/auth/login', null, { email: real, password: PW })
    const lockedGhost = await call('POST', '/auth/login', null, { email: ghost, password: 'anything-at-all' })
    assert.equal(lockedReal.status, 429)
    assert.equal(lockedGhost.status, 429, 'an unknown email behaves exactly the same')
    assert.equal(lockedReal.json.code, lockedGhost.json.code)
    resetLoginGuard()
    assert.equal((await call('POST', '/auth/login', null, { email: real, password: PW })).status, 200, 'works again once the window passes')
  })

  it('a successful login clears earlier failures', async () => {
    resetLoginGuard()
    for (let i = 0; i < 9; i++) await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'nope-nope' })
    assert.equal((await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'BrandNewPass1' })).status, 200)
    for (let i = 0; i < 9; i++) await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'nope-nope' })
    assert.equal((await call('POST', '/auth/login', null, { email: 'a@isquareit.edu.in', password: 'BrandNewPass1' })).status, 200)
    resetLoginGuard()
  })
})

describe('uploads', () => {
  const complaint = (file?: { name: string; type: string; bytes: Buffer }) => {
    const fd = new FormData()
    fd.set('categoryId', '1')
    fd.set('description', 'The fan in my room is making a lot of noise')
    if (file) fd.set('image', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
    return fd
  }
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

  it('refuses SVG (it can carry scripts), HTML, and other non-photos', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.svg', type: 'image/svg+xml', bytes: svg }))).status, 400)
    assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.html', type: 'text/html', bytes: Buffer.from('<h1>hi</h1>') }))).status, 400)
    assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.png', type: 'image/png', bytes: svg }))).status, 400, 'a lie about the type is caught by the file contents')
  })

  it('stores a real photo under a random name, whatever it was called', async () => {
    const r = await call('POST', '/complaints', 'student', complaint({ name: '../../evil.php.png', type: 'image/png', bytes: PNG }))
    assert.equal(r.status, 201)
    assert.match(r.json.complaint.imageUrl, /^\/api\/files\/[A-Za-z0-9_-]{20,}\.png$/)
    assert.ok(!r.json.complaint.imageUrl.includes('evil'))
  })

  describe('videos on a new complaint', () => {
    /** The smallest thing that starts like a real file of that type; the server only checks the first bytes. */
    const mp4 = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`, 'ascii'), Buffer.alloc(4000)])
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(4000)])

    it('accepts MP4, MOV and WebM, stores them under random names, and plays them back', async () => {
      for (const [file, ext, type] of [
        [{ name: 'a.mp4', type: 'video/mp4', bytes: mp4('isom') }, 'mp4', 'video/mp4'],
        [{ name: 'b.mov', type: 'video/quicktime', bytes: mp4('qt  ') }, 'mov', 'video/quicktime'],
        [{ name: 'c.webm', type: 'video/webm', bytes: webm }, 'webm', 'video/webm'],
      ] as const) {
        const r = await call('POST', '/complaints', 'student', complaint(file))
        assert.equal(r.status, 201, ext)
        assert.match(r.json.complaint.imageUrl, new RegExp(`^/api/files/[A-Za-z0-9_-]{20,}\\.${ext}$`))
        const res = await fetch(base.replace('/api', '') + r.json.complaint.imageUrl, { headers: { Cookie: cookies.student } })
        assert.equal(res.status, 200)
        assert.match(res.headers.get('content-type') ?? '', new RegExp(type))
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
        await res.arrayBuffer()
      }
    })

    it('supports seeking (Range requests), which phones need to play video', async () => {
      const r = await call('POST', '/complaints', 'student', complaint({ name: 'seek.mp4', type: 'video/mp4', bytes: mp4('mp42') }))
      const res = await fetch(base.replace('/api', '') + r.json.complaint.imageUrl, { headers: { Cookie: cookies.student, Range: 'bytes=0-99' } })
      assert.equal(res.status, 206)
      assert.equal((await res.arrayBuffer()).byteLength, 100)
    })

    it('other people cannot watch it', async () => {
      const r = await call('POST', '/complaints', 'student', complaint({ name: 'p.mp4', type: 'video/mp4', bytes: mp4('isom') }))
      const res = await fetch(base.replace('/api', '') + r.json.complaint.imageUrl)
      assert.equal(res.status, 401)
      await res.arrayBuffer()
    })

    it('refuses a phone photo (HEIC) or anything else that is not really a video, whatever it is called', async () => {
      assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.mp4', type: 'video/mp4', bytes: mp4('heic') }))).status, 400)
      assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.mp4', type: 'video/mp4', bytes: Buffer.from('<h1>not a video</h1>'.repeat(20)) }))).status, 400)
      assert.equal((await call('POST', '/complaints', 'student', complaint({ name: 'x.avi', type: 'video/x-msvideo', bytes: mp4('isom') }))).status, 400, 'other video types are not accepted')
    })

    it('a video over 25 MB is refused, and a photo keeps its 5 MB limit', async () => {
      const huge = await call('POST', '/complaints', 'student', complaint({ name: 'big.mp4', type: 'video/mp4', bytes: Buffer.concat([mp4('isom'), Buffer.alloc(26 * 1024 * 1024)]) }))
      assert.equal(huge.status, 413)
      const bigPhoto = await call('POST', '/complaints', 'student', complaint({ name: 'big.png', type: 'image/png', bytes: Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]) }))
      assert.equal(bigPhoto.status, 400)
      assert.equal(bigPhoto.json.code, 'FILE_TOO_LARGE')
    })

    it('one person can have only one upload in progress: a second is turned away until the first is over', async () => {
      const url = new URL(base + '/complaints')
      const boundary = '----slowupload'
      // Start an upload that never finishes: the headers and the first bit of the body, then silence.
      const first = http.request({
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { Cookie: cookies.student, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': '1000000' },
      })
      first.on('error', () => {})
      first.write(`--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nhalf`)
      await new Promise((r) => setTimeout(r, 200))
      const second = await call('POST', '/complaints', 'student', complaint())
      assert.equal(second.status, 429)
      assert.equal(second.json.code, 'UPLOAD_IN_PROGRESS')
      first.destroy()
      await new Promise((r) => setTimeout(r, 300))
      assert.equal((await call('POST', '/complaints', 'student', complaint())).status, 201, 'and once the first is over, uploading works again')
    })

    it('videos are for new complaints only: notes still take photos only', async () => {
      const created = await call('POST', '/complaints', 'student', complaint())
      const fd = new FormData()
      fd.set('note', 'Here is more info')
      fd.set('image', new Blob([new Uint8Array(mp4('isom'))], { type: 'video/mp4' }), 'v.mp4')
      assert.equal((await call('POST', `/complaints/${created.json.complaint.code}/notes`, 'student', fd)).status, 400)
    })
  })

  it('serves photos with nosniff so a browser never guesses a different type', async () => {
    const list = await call('GET', '/complaints', 'student')
    const url = list.json.items.find((c: any) => c.imageUrl?.endsWith('.png')).imageUrl as string
    const res = await fetch(base.replace('/api', '') + url, { headers: { Cookie: cookies.student } })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.match(res.headers.get('content-type') ?? '', /image\/png/)
  })
})

describe('headers and cross-site requests', () => {
  it('API responses carry the standard hardening headers and hide the framework', async () => {
    const r = await call('GET', '/health', null)
    assert.equal(r.res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(r.res.headers.get('x-powered-by'), null)
    assert.ok(r.res.headers.get('content-security-policy'))
    assert.ok(r.res.headers.get('strict-transport-security'))
  })

  it('a write from another website is blocked, even with a valid cookie', async () => {
    const r = await call('POST', '/complaints/HST-1001/cancel', 'student', {}, { Origin: 'https://evil.example' })
    assert.equal(r.status, 403)
    assert.equal(r.json.code, 'BAD_ORIGIN')
  })
})

describe('production safeguards', () => {
  // Run from an empty folder so the developer's own server/.env cannot leak into the check.
  const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixnest-prod-'))
  const run = (code: string, env: Record<string, string | undefined>) =>
    spawnSync(process.execPath, ['--import', import.meta.resolve('tsx/esm'), '--input-type=module', '-e', code], {
      cwd: cleanDir,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), ...env } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 30_000,
    })

  it('refuses to start in production without a strong JWT_SECRET', () => {
    const missing = run(`await import('${fileUrl('src/config.ts')}')`, { NODE_ENV: 'production' })
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /JWT_SECRET/)
    const weak = run(`await import('${fileUrl('src/config.ts')}')`, { NODE_ENV: 'production', JWT_SECRET: 'short' })
    assert.notEqual(weak.status, 0)
    const strong = run(`await import('${fileUrl('src/config.ts')}')`, { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) })
    assert.equal(strong.status, 0, strong.stderr)
  })

  it('never prints login codes to the logs in production; without SMTP it fails instead', () => {
    const r = run(
      `import { sendMail } from '${fileUrl('src/services/mailer.ts')}'
       try { await sendMail({ to: 'a@b.co', subject: 'Code', text: 'Your code is 123456' }); console.log('SENT') }
       catch (e) { console.log('FAILED:' + e.code) }`,
      { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) },
    )
    assert.match(r.stdout, /FAILED:EMAIL_UNAVAILABLE/)
    assert.ok(!r.stdout.includes('123456') && !r.stderr.includes('123456'), 'the code must not appear in any log output')
  })
})

describe('serving the built web app', () => {
  let staticBase = ''
  let staticServer: ReturnType<ReturnType<typeof createApp>['listen']>
  const INLINE = "try{document.documentElement.classList.add('x')}catch(e){}"

  before(() => {
    const dist = path.join(root, 'dist')
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><html><head><script>${INLINE}</script></head><body><div id="root"></div><script type="module" src="/assets/app.abc123.js"></script></body></html>`)
    fs.writeFileSync(path.join(dist, 'assets', 'app.abc123.js'), 'console.log("app")')
    fs.writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    fs.writeFileSync(path.join(root, 'secret.txt'), 'TOP SECRET')
    staticServer = createApp({ clientDist: dist }).listen(0)
    staticBase = `http://localhost:${(staticServer.address() as AddressInfo).port}`
  })
  after(() => staticServer.close())

  it('serves the app for any page address, with a CSP that allows only the one inline script it ships', async () => {
    for (const p of ['/', '/login', '/complaints/HST-1001', '/setup/print/1']) {
      const res = await fetch(staticBase + p)
      assert.equal(res.status, 200, p)
      assert.match(await res.text(), /id="root"/)
      const csp = res.headers.get('content-security-policy') ?? ''
      const hash = crypto.createHash('sha256').update(INLINE).digest('base64')
      assert.ok(csp.includes(`'sha256-${hash}'`), 'inline script is allowed by its hash only')
      assert.ok(!csp.includes("'unsafe-inline'") || !/script-src[^;]*'unsafe-inline'/.test(csp), 'scripts may not be inline in general')
      assert.match(csp, /frame-ancestors 'self'/)
      assert.match(csp, /object-src 'none'/)
      assert.match(csp, /accounts\.google\.com\/gsi\/client/)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
      // Google's sign-in popup must be able to talk back to the page that opened it; "same-origin" leaves it blank.
      assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups', p)
    }
  })

  it('hashed assets are cached for a year; missing assets are a clean 404', async () => {
    const ok = await fetch(`${staticBase}/assets/app.abc123.js`)
    assert.equal(ok.status, 200)
    assert.match(ok.headers.get('cache-control') ?? '', /max-age=31536000/)
    assert.match(ok.headers.get('cache-control') ?? '', /immutable/)
    const missing = await fetch(`${staticBase}/assets/nope.js`)
    assert.equal(missing.status, 404)
    assert.match(missing.headers.get('content-type') ?? '', /json/)
  })

  it('the API is not shadowed by the app, and unknown API paths are JSON 404s', async () => {
    assert.equal((await fetch(`${staticBase}/api/health`)).status, 200)
    const nope = await fetch(`${staticBase}/api/does-not-exist`)
    assert.equal(nope.status, 404)
    assert.match(nope.headers.get('content-type') ?? '', /json/)
    const post = await fetch(`${staticBase}/anything`, { method: 'POST' })
    assert.equal(post.status, 404)
  })

  it('cannot be tricked into serving files outside the app folder', async () => {
    for (const p of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '/..\\secret.txt']) {
      const res = await fetch(staticBase + p)
      assert.ok(!(await res.text()).includes('TOP SECRET'), p)
    }
  })
})
