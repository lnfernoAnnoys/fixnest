import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express, { type Express, type Request, type Response } from 'express'

/**
 * Serves the built web app from the same server as the API, so there is one address, no CORS, and cookies
 * stay first-party. Adds a strict Content-Security-Policy that allows only what the app really uses:
 * its own files, and Google's sign-in script and frame.
 * Returns false (and serves nothing) if the client has not been built yet.
 */
export function serveClient(app: Express, distDir: string): boolean {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) return false
  const html = fs.readFileSync(indexPath, 'utf8')

  // The page has a tiny inline script that applies the saved theme before first paint; allow exactly that one.
  const inlineHashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`,
  )
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inlineHashes.join(' ')} https://accounts.google.com/gsi/client`.replace(/ +/g, ' '),
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://accounts.google.com/gsi/",
    'frame-src https://accounts.google.com/gsi/',
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ')

  // Hashed build files never change, so browsers may keep them for a year.
  app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: false }))
  app.use(express.static(distDir, { maxAge: '1d', index: false }))

  // Any other page address is handled by the app's own router.
  const page = (req: Request, res: Response, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api/')) return next()
    res.setHeader('Content-Security-Policy', csp)
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
    res.type('html').send(html)
  }
  app.use(page)
  return true
}
