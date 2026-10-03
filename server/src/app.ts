import cookieParser from 'cookie-parser'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { config } from './config.js'
import { db } from './db/connection.js'
import { HttpError } from './lib/errors.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/auth.js'
import complaintRoutes from './routes/complaints.js'
import hostelRoutes from './routes/hostels.js'
import { categoriesRouter, filesRouter, notificationsRouter, staffRouter } from './routes/misc.js'
import profileRoutes from './routes/profile.js'
import statsRoutes from './routes/stats.js'
import { serveClient } from './static.js'

/**
 * @param clientDist folder with the built web app to serve (defaults to the real build in production, nothing otherwise)
 */
export function createApp(options: { clientDist?: string | null } = {}) {
  const app = express()
  app.disable('x-powered-by')
  // Behind a reverse proxy (nginx, a host's load balancer) the real visitor address is in a header; trust it
  // only when told how many proxies sit in front, otherwise anyone could fake their address to dodge rate limits.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy)
  // "Continue with Google" opens a popup and gets the answer back through the page that opened it. The default policy
  // (same-origin) cuts that link and leaves the popup blank, so allow popups the page itself opened.
  app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }))
  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))

  // A generous ceiling for the whole API; the sensitive routes have tighter limits of their own.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down and try again in a minute.', code: 'RATE_LIMIT' },
    }),
  )

  // CSRF defence in depth (cookies are also SameSite=Lax): browsers always send Origin on
  // cross-site writes, so reject state-changing requests that come from another site.
  app.use((req, _res, next) => {
    const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
    const origin = req.headers.origin
    if (!safe && origin && origin !== config.appUrl) return next(new HttpError(403, 'Request blocked.', 'BAD_ORIGIN'))
    next()
  })

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get() // fails (500) if the database is not reachable
    res.json({ ok: true })
  })
  app.use('/api/auth', authRoutes)
  app.use('/api/profile', profileRoutes)
  app.use('/api/hostels', hostelRoutes)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/complaints', complaintRoutes)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/files', filesRouter)
  app.use('/api/staff', staffRouter)
  app.use('/api/stats', statsRoutes)
  app.use('/api/admin', adminRoutes)

  const dist = options.clientDist !== undefined ? options.clientDist : config.isProd ? config.clientDist : null
  if (dist && !serveClient(app, dist)) {
    console.warn(`[static] No built web app found in ${dist}. Run "npm run build" first, or use the dev server.`)
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
