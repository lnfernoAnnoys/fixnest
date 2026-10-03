/**
 * Complaint lifecycle and who may do what: student -> admin assigns -> staff acknowledges,
 * starts, fixes -> student reopens. Run with: npm test -w server
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

process.env.DB_PATH = path.join(os.tmpdir(), `fixnest-wf-${process.pid}-${Date.now()}.db`)
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret'
process.env.NODE_ENV = 'test'
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `fixnest-wf-uploads-${process.pid}`)

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

/** 1x1 PNG, enough to pass the upload checks. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function call(method: string, url: string, who: string | null, body?: unknown | FormData) {
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

const form = (fields: Record<string, string>, withPhoto = false) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  if (withPhoto) fd.set('image', new Blob([PNG], { type: 'image/png' }), 'proof.png')
  return fd
}

async function addUser(key: string, role: string, email: string) {
  const hash = await hashPassword(PW)
  ids[key] = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?,?,1)').run(key, email, hash, role).lastInsertRowid)
  if (role === 'student') db.prepare('INSERT INTO student_profiles (user_id,hostel_id,room_id) VALUES (?,?,?)').run(ids[key], hostelId, roomId)
  const r = await call('POST', '/auth/login', null, { email, password: PW })
  assert.equal(r.status, 200, `login ${key}`)
  cookies[key] = r.cookie!
}

let code = ''

before(async () => {
  migrate()
  ensureBaseData()
  hostelId = Number(db.prepare("INSERT INTO hostels (name) VALUES ('Test Hostel')").run().lastInsertRowid)
  roomId = Number(db.prepare("INSERT INTO rooms (hostel_id,floor,number) VALUES (?,1,'101')").run(hostelId).lastInsertRowid)
  server = createApp().listen(0)
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`
  await addUser('student', 'student', 's1@students.isquareit.edu.in')
  await addUser('student2', 'student', 's2@students.isquareit.edu.in')
  await addUser('staffA', 'staff', 'a@isquareit.edu.in')
  await addUser('staffB', 'staff', 'b@isquareit.edu.in')
  await addUser('admin', 'admin', 'w@isquareit.edu.in')

  const c = await call('POST', '/complaints', 'student', form({ categoryId: '1', description: 'The ceiling fan is not working at all', priority: 'medium' }))
  assert.equal(c.status, 201)
  code = c.json.complaint.code
})

after(() => server.close())

const notificationsFor = async (who: string) => (await call('GET', '/notifications', who)).json.items.map((n: any) => n.title) as string[]

describe('assignment', () => {
  it('staff cannot see a complaint that is not assigned to them', async () => {
    assert.equal((await call('GET', `/complaints/${code}`, 'staffA')).status, 404)
    assert.equal((await call('GET', '/complaints', 'staffA')).json.total, 0)
  })

  it('only an admin can assign', async () => {
    for (const who of ['student', 'staffA', 'staffB']) {
      assert.equal((await call('POST', `/complaints/${code}/assign`, who, { staffId: ids.staffA })).status, 403, who)
    }
    assert.equal((await call('POST', `/complaints/${code}/assign`, null, { staffId: ids.staffA })).status, 401)
  })

  it('admin assigns to a staff member; both sides are notified and the status becomes Assigned', async () => {
    const r = await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: ids.staffA })
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.status, 'assigned')
    assert.equal(r.json.complaint.assignedStaff.id, ids.staffA)
    assert.ok((await notificationsFor('student')).some((t) => t.includes('assigned')))
    assert.ok((await notificationsFor('staffA')).some((t) => t.startsWith('New assignment')))
  })

  it('cannot assign to a student, an admin, or a non-existent user', async () => {
    assert.equal((await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: ids.student })).status, 400)
    assert.equal((await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: ids.admin })).status, 400)
    assert.equal((await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: 99999 })).status, 400)
  })

  it('the assigned staff member sees it; a different staff member still does not', async () => {
    assert.equal((await call('GET', `/complaints/${code}`, 'staffA')).status, 200)
    assert.equal((await call('GET', `/complaints/${code}`, 'staffB')).status, 404)
    assert.equal((await call('GET', '/complaints', 'staffA')).json.total, 1)
  })

  it('admin can see the student email but staff cannot', async () => {
    assert.ok((await call('GET', `/complaints/${code}`, 'admin')).json.complaint.student.email)
    assert.equal((await call('GET', `/complaints/${code}`, 'staffA')).json.complaint.student.email, undefined)
  })
})

describe('staff work', () => {
  it('another staff member cannot acknowledge or act on it', async () => {
    assert.equal((await call('POST', `/complaints/${code}/acknowledge`, 'staffB')).status, 404)
    assert.equal((await call('POST', `/complaints/${code}/status`, 'staffB', { status: 'in_progress' })).status, 404)
  })

  it('students cannot use staff actions', async () => {
    assert.equal((await call('POST', `/complaints/${code}/acknowledge`, 'student')).status, 403)
    assert.equal((await call('POST', `/complaints/${code}/status`, 'student', { status: 'fixed', note: 'done done' })).status, 403)
  })

  it('cannot jump straight to fixed', async () => {
    const r = await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'fixed', note: 'Replaced the capacitor' }))
    assert.equal(r.status, 403)
  })

  it('acknowledges once', async () => {
    const r = await call('POST', `/complaints/${code}/acknowledge`, 'staffA')
    assert.equal(r.status, 200)
    assert.ok(r.json.complaint.acknowledgedAt)
    assert.equal((await call('POST', `/complaints/${code}/acknowledge`, 'staffA')).status, 409)
  })

  it('starts work: status In progress, student notified', async () => {
    const r = await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'in_progress' }))
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.status, 'in_progress')
    assert.ok((await notificationsFor('student')).some((t) => t.startsWith('Work started')))
  })

  it('adds a progress note with a photo, visible to the student', async () => {
    const r = await call('POST', `/complaints/${code}/notes`, 'staffA', form({ note: 'Ordered the spare part' }, true))
    assert.equal(r.status, 201)
    const t = (await call('GET', `/complaints/${code}`, 'student')).json.timeline
    const note = t.find((x: any) => x.type === 'note')
    assert.equal(note.note, 'Ordered the spare part')
    assert.ok(note.imageUrl)
  })

  it('marking fixed needs a real resolution note', async () => {
    assert.equal((await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'fixed' }))).status, 400)
    assert.equal((await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'fixed', note: 'ok' }))).status, 400)
  })

  it('staff cannot reject', async () => {
    assert.equal((await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'rejected', note: 'not our job' }))).status, 403)
  })

  it('marks fixed with a note and proof photo; student and admin are notified', async () => {
    const r = await call('POST', `/complaints/${code}/status`, 'staffA', form({ status: 'fixed', note: 'Replaced the fan capacitor' }, true))
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.status, 'fixed')
    assert.equal(r.json.complaint.resolutionNote, 'Replaced the fan capacitor')
    assert.ok(r.json.complaint.resolvedAt)
    assert.ok((await notificationsFor('student')).some((t) => t.includes('is fixed')))
    assert.ok((await notificationsFor('admin')).some((t) => t.includes('marked fixed')))
  })

  it('the proof photo is visible to the student and admin, but not to another student or staff', async () => {
    const url = (await call('GET', `/complaints/${code}`, 'student')).json.timeline.find((x: any) => x.toStatus === 'fixed').imageUrl as string
    const get = async (who: string) => (await fetch(base.replace('/api', '') + url, { headers: { Cookie: cookies[who] } })).status
    assert.equal(await get('student'), 200)
    assert.equal(await get('admin'), 200)
    assert.equal(await get('staffA'), 200)
    assert.equal(await get('student2'), 404)
    assert.equal(await get('staffB'), 404)
  })

  it('a fixed complaint no longer accepts notes or priority changes', async () => {
    assert.equal((await call('POST', `/complaints/${code}/notes`, 'student', form({ note: 'thanks' }))).status, 403)
    assert.equal((await call('POST', `/complaints/${code}/priority`, 'admin', { priority: 'high' })).status, 403)
  })
})

describe('reopen', () => {
  it("another student cannot reopen someone else's complaint", async () => {
    assert.equal((await call('POST', `/complaints/${code}/reopen`, 'student2', { note: 'still broken' })).status, 404)
  })

  it('the owner can reopen with a reason; it returns to the assigned staff', async () => {
    assert.equal((await call('POST', `/complaints/${code}/reopen`, 'student', { note: 'no' })).status, 400)
    const r = await call('POST', `/complaints/${code}/reopen`, 'student', { note: 'The fan stopped again this morning' })
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.status, 'assigned')
    assert.equal(r.json.complaint.resolvedAt, null)
    assert.equal(r.json.complaint.acknowledgedAt, null)
    assert.ok((await notificationsFor('staffA')).some((t) => t.includes('reopened')))
  })

  it('cannot reopen after the 7-day window', async () => {
    const c2 = await call('POST', '/complaints', 'student', form({ categoryId: '2', description: 'Tap is leaking in the bathroom' }))
    const code2 = c2.json.complaint.code
    await call('POST', `/complaints/${code2}/assign`, 'admin', { staffId: ids.staffA })
    await call('POST', `/complaints/${code2}/status`, 'staffA', form({ status: 'in_progress' }))
    await call('POST', `/complaints/${code2}/status`, 'staffA', form({ status: 'fixed', note: 'Replaced the washer' }))
    db.prepare("UPDATE complaints SET resolved_at = datetime('now','-8 days') WHERE code = ?").run(code2)
    assert.equal((await call('POST', `/complaints/${code2}/reopen`, 'student', { note: 'leaking again now' })).status, 403)
  })
})

describe('admin controls', () => {
  it('changes priority with a history entry and notifies the student and staff', async () => {
    const r = await call('POST', `/complaints/${code}/priority`, 'admin', { priority: 'urgent' })
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.priority, 'urgent')
    assert.ok(r.json.timeline.some((t: any) => t.type === 'priority' && t.note.includes('urgent')))
    assert.equal((await call('POST', `/complaints/${code}/priority`, 'admin', { priority: 'urgent' })).status, 400)
  })

  it('staff and students cannot change priority', async () => {
    assert.equal((await call('POST', `/complaints/${code}/priority`, 'staffA', { priority: 'low' })).status, 403)
    assert.equal((await call('POST', `/complaints/${code}/priority`, 'student', { priority: 'low' })).status, 403)
  })

  it('reassigning notifies the previous staff member and resets acknowledgement', async () => {
    const r = await call('POST', `/complaints/${code}/assign`, 'admin', { staffId: ids.staffB })
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.assignedStaff.id, ids.staffB)
    assert.equal((await call('GET', `/complaints/${code}`, 'staffA')).status, 404, 'previous staff lose access')
    assert.ok((await notificationsFor('staffA')).some((t) => t.includes('reassigned')))
  })

  it('admin rejects with a reason; needs one; the student is told', async () => {
    const c3 = await call('POST', '/complaints', 'student2', form({ categoryId: '3', description: 'I would like a new sofa in my room' }))
    const code3 = c3.json.complaint.code
    assert.equal((await call('POST', `/complaints/${code3}/status`, 'admin', form({ status: 'rejected' }))).status, 400)
    const r = await call('POST', `/complaints/${code3}/status`, 'admin', form({ status: 'rejected', note: 'Not a maintenance issue' }))
    assert.equal(r.status, 200)
    assert.equal(r.json.complaint.status, 'rejected')
    assert.ok((await notificationsFor('student2')).some((t) => t.includes('not accepted')))
    assert.equal((await call('POST', `/complaints/${code3}/cancel`, 'student2')).status, 403, 'closed complaints cannot be cancelled')
  })

  it('only admins can list staff', async () => {
    const ok = await call('GET', '/staff', 'admin')
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.json.staff.map((s: any) => s.name).sort(), ['staffA', 'staffB'])
    assert.equal((await call('GET', '/staff', 'staffA')).status, 403)
    assert.equal((await call('GET', '/staff', 'student')).status, 403)
    assert.equal((await call('GET', '/staff', null)).status, 401)
  })
})
