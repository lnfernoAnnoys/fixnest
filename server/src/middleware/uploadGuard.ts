import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/errors.js'

/** How many uploads the server will receive at the same time, in total. */
const MAX_AT_ONCE = 6
const busyUsers = new Set<number>()
let inFlight = 0

/**
 * An upload is held in memory while it arrives, and a video can be 25 MB. So one person may have only one upload
 * going at a time, and only a few can be in progress overall, which keeps a burst (or a bad actor) from filling the
 * server's memory. Put this after the sign-in check and before the upload parser.
 */
export function limitConcurrentUploads(req: Request, res: Response, next: NextFunction) {
  const id = req.user!.id
  if (busyUsers.has(id)) return next(new HttpError(429, 'Your last upload is still going. Wait for it to finish.', 'UPLOAD_IN_PROGRESS'))
  if (inFlight >= MAX_AT_ONCE) return next(new HttpError(503, 'The server is busy receiving uploads. Please try again in a moment.', 'BUSY'))
  busyUsers.add(id)
  inFlight++
  let released = false
  const release = () => {
    if (released) return
    released = true
    busyUsers.delete(id)
    inFlight--
  }
  res.on('finish', release)
  res.on('close', release)
  next()
}
