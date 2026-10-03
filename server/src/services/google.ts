import { OAuth2Client } from 'google-auth-library'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'

export interface GoogleIdentity {
  sub: string
  email: string
  name: string
  /** https URL on a Google image host, or null. */
  picture: string | null
}

export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>

let client: OAuth2Client | null = null

/** Only accept https images hosted by Google, so a profile picture can never point somewhere else. */
export function safePicture(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 500) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const isGoogleImageHost = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com')
    return u.protocol === 'https:' && isGoogleImageHost ? u.toString() : null
  } catch {
    return null
  }
}

/** Verifies a Google ID token: signature, audience (our client id), expiry, and that Google verified the email. */
const defaultVerifier: GoogleVerifier = async (credential) => {
  if (!config.googleClientId) throw new HttpError(503, 'Google sign-in is not set up yet.', 'GOOGLE_DISABLED')
  client ??= new OAuth2Client(config.googleClientId)
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId })
    const p = ticket.getPayload()
    if (!p?.sub || !p.email || !p.email_verified) throw new Error('unverified')
    return { sub: p.sub, email: p.email.toLowerCase(), name: (p.name || p.email.split('@')[0]).slice(0, 80), picture: safePicture(p.picture) }
  } catch {
    throw new HttpError(401, "We couldn't verify that Google sign-in. Please try again.", 'GOOGLE_INVALID')
  }
}

let verifier: GoogleVerifier = defaultVerifier

/** Lets tests replace the Google network call. Not used by the app itself. */
export function setGoogleVerifier(fn: GoogleVerifier | null) {
  verifier = fn ?? defaultVerifier
}

export const verifyGoogleCredential: GoogleVerifier = (credential) => verifier(credential)
