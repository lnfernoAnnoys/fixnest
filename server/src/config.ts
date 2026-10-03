import crypto from 'node:crypto'
import path from 'node:path'

// Load server/.env if present (Node built-in; no dotenv dependency).
try {
  process.loadEnvFile('.env')
} catch {
  /* no .env file: rely on real environment variables */
}

const isProd = process.env.NODE_ENV === 'production'

let secret = process.env.JWT_SECRET
if (isProd && (!secret || secret.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production')
}
if (!secret) {
  secret = crypto.randomBytes(48).toString('hex')
  console.warn('[config] JWT_SECRET not set: using a temporary one, sessions reset on restart.')
}

const list = (v: string | undefined, fallback: string) =>
  (v || fallback)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  /**
   * Which network address to listen on. A live site sits behind a web server (Caddy) on the same machine, so by
   * default it only accepts connections from that machine. In development it listens everywhere, so a phone on the
   * same Wi-Fi can reach it. Set HOST=0.0.0.0 to listen everywhere in production too.
   */
  host: process.env.HOST || (isProd ? '127.0.0.1' : undefined),
  jwtSecret: secret,
  /** Public URL of the web app: used for origin checks and for the links in emails. */
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  dbPath: path.resolve(process.env.DB_PATH || './hostel.db'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  /** The built web app (npm run build). Served by this server in production. */
  clientDist: path.resolve(process.env.CLIENT_DIST || '../client/dist'),
  maxUploadBytes: 5 * 1024 * 1024,
  /** Videos attached to a new complaint may be bigger than photos. */
  maxVideoBytes: 25 * 1024 * 1024,
  /** Only these email domains may self-register as students. */
  studentEmailDomains: list(process.env.STUDENT_EMAIL_DOMAINS, 'students.isquareit.edu.in'),
  /** OAuth client id for Google sign-in (public value). Leave unset to hide the Google buttons. */
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim() || null,
  /** How many reverse-proxy hops to trust for the client IP (rate limiting). 0 = none. */
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  /** Outgoing email. Without SMTP_HOST the app only prints emails to the console, and only outside production. */
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASS || undefined,
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'FixNest <no-reply@localhost>',
      }
    : null,
  /** Requests per 15 minutes per address for sign-in routes (tests raise it). */
  rateLimit: { auth: Number(process.env.RATE_LIMIT_AUTH) || 60 },
  sessionDays: 7,
  verification: { ttlMinutes: 10, maxAttempts: 5, resendSeconds: 60 },
  /** Days a student must wait before changing their hostel or room again. */
  roomChangeCooldownDays: 30,
  /** Hours after which an open complaint counts as overdue, by priority. */
  overdueHours: { urgent: 24, high: 48, medium: 72, low: 168 } as Record<string, number>,
}
