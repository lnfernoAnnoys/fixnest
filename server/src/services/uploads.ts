import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from '../config.js'
import { badRequest } from '../lib/errors.js'
import { randomToken } from '../lib/security.js'

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime']

/** Parses one optional `image` field (photos only) into memory. Limits are enforced by multer. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.includes(file.mimetype)) return cb(null, true)
    cb(badRequest('Only JPEG, PNG or WebP photos are allowed.', 'BAD_FILE_TYPE'))
  },
}).single('image')

/** Same field, but the file may also be a video (used only when a student files a complaint). */
export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxVideoBytes, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.includes(file.mimetype) || VIDEO_MIME.includes(file.mimetype)) return cb(null, true)
    cb(badRequest('Attach a JPEG, PNG or WebP photo, or an MP4, WebM or MOV video.', 'BAD_FILE_TYPE'))
  },
}).single('image')

type Kind = 'jpg' | 'png' | 'webp' | 'mp4' | 'mov' | 'webm'
const IMAGE_KINDS: Kind[] = ['jpg', 'png', 'webp']

/** Photo formats that share the MP4 file layout (phone HEIC/AVIF pictures); they are not videos. */
const PHOTO_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis'])

/** Detects the real file type from the file's first bytes (the client-sent MIME type can be faked). */
function sniff(buf: Buffer): Kind | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii')
    if (PHOTO_BRANDS.has(brand)) return null
    return brand === 'qt  ' ? 'mov' : 'mp4'
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'
  return null
}

function store(file: Express.Multer.File, kind: Kind): string {
  fs.mkdirSync(config.uploadDir, { recursive: true })
  const name = `${randomToken(18)}.${kind}`
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer, { flag: 'wx' })
  return name
}

/** Validates and stores an uploaded photo under a random name. Returns the stored filename. */
export function saveImage(file: Express.Multer.File | undefined): string | null {
  if (!file) return null
  const kind = sniff(file.buffer)
  if (!kind || !IMAGE_KINDS.includes(kind)) throw badRequest('That file is not a valid photo. Use a JPEG, PNG or WebP image.', 'BAD_FILE_TYPE')
  return store(file, kind)
}

/** Like saveImage, but also accepts an MP4, MOV or WebM video. Photos keep their smaller size limit. */
export function saveMedia(file: Express.Multer.File | undefined): string | null {
  if (!file) return null
  const kind = sniff(file.buffer)
  if (!kind) throw badRequest('That file is not a valid photo or video. Use a JPEG, PNG or WebP photo, or an MP4, WebM or MOV video.', 'BAD_FILE_TYPE')
  if (IMAGE_KINDS.includes(kind) && file.size > config.maxUploadBytes) throw badRequest('That photo is too large. The limit is 5 MB.', 'FILE_TOO_LARGE')
  return store(file, kind)
}

export const imageUrl = (name: string | null) => (name ? `/api/files/${name}` : null)
