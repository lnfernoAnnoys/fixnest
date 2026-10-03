import type { ErrorRequestHandler, RequestHandler } from 'express'
import { HttpError } from '../lib/errors.js'

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid request body.', code: 'VALIDATION' })
    return
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request too large.', code: 'TOO_LARGE' })
    return
  }
  if (err?.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE'
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'That file is too large. Photos can be up to 5 MB and videos up to 25 MB.' : 'Could not read the upload.', code: tooBig ? 'FILE_TOO_LARGE' : 'BAD_UPLOAD' })
    return
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: 'Not found.', code: err.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'SERVER' })
}
