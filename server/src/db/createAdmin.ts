/**
 * Creates (or promotes) an admin account without any demo data.
 * Usage:  ADMIN_PASSWORD=... npm run create-admin -- "Warden Name" warden@example.com
 */
import { hashPassword } from '../lib/security.js'
import { db } from './connection.js'
import { migrate } from './migrate.js'

const [name, email] = process.argv.slice(2)
const password = process.env.ADMIN_PASSWORD
if (!name || !email || !password || password.length < 10) {
  console.error('Usage: ADMIN_PASSWORD=<10+ chars> npm run create-admin -- "Name" email@example.com')
  process.exit(1)
}

migrate()
const hash = await hashPassword(password)
db.prepare(
  `INSERT INTO users (name,email,password_hash,role,email_verified) VALUES (?,?,?, 'admin', 1)
   ON CONFLICT(email) DO UPDATE SET role='admin', password_hash=excluded.password_hash, email_verified=1, active=1`,
).run(name, email.toLowerCase(), hash)
console.log(`Admin account ready: ${email.toLowerCase()}`)
