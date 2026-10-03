import { Router } from 'express'
import { db } from '../db/connection.js'

const router = Router()

/** Public list of hostels and their rooms, used by the signup form. */
router.get('/', (_req, res) => {
  const hostels = db.prepare('SELECT id, name FROM hostels ORDER BY name').all() as unknown as { id: number; name: string }[]
  const rooms = db.prepare('SELECT id, hostel_id AS hostelId, floor, number FROM rooms ORDER BY hostel_id, floor, number').all() as unknown as {
    id: number; hostelId: number; floor: number; number: string
  }[]
  res.json({ hostels: hostels.map((h) => ({ ...h, rooms: rooms.filter((r) => r.hostelId === h.id) })) })
})

export default router
