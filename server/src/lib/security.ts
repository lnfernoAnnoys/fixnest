import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10)

// A real bcrypt hash used to keep login timing similar when the email doesn't exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)
export async function verifyPassword(pw: string, hash: string | undefined) {
  const ok = await bcrypt.compare(pw, hash ?? DUMMY_HASH)
  return ok && !!hash
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
export const randomToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url')
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
