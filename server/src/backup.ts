/**
 * Makes a backup of the database and the uploaded photos and videos, and deletes backups older than KEEP_DAYS.
 * Usage:  npm run backup -w server            (backups go to BACKUP_DIR, default ./backups)
 *
 * The database copy is taken with SQLite's own VACUUM INTO, so it is complete and consistent even while the app is
 * running and people are using it. Run it every night from cron (see DEPLOY.md).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 14
const dir = path.resolve(process.env.BACKUP_DIR || './backups')
const stamp = new Date().toISOString().slice(0, 10)

if (!fs.existsSync(config.dbPath)) {
  console.error(`No database found at ${config.dbPath}. Nothing to back up.`)
  process.exit(1)
}
fs.mkdirSync(dir, { recursive: true })

const dbFile = path.join(dir, `hostel-${stamp}.db`)
fs.rmSync(dbFile, { force: true })
const db = new DatabaseSync(config.dbPath, { readOnly: true })
db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`)
db.close()
console.log(`Database saved: ${dbFile}`)

if (fs.existsSync(config.uploadDir)) {
  const uploadsFile = path.join(dir, `uploads-${stamp}.tgz`)
  // The archive is named relative to the backup folder: tar reads a "C:" in a file name as a remote machine.
  const tar = spawnSync('tar', ['-czf', path.basename(uploadsFile), '-C', path.dirname(path.resolve(config.uploadDir)), path.basename(path.resolve(config.uploadDir))], { cwd: dir, encoding: 'utf8' })
  if (tar.status !== 0) {
    console.error(`Could not archive the uploads: ${tar.stderr || tar.error}`)
    process.exit(1)
  }
  console.log(`Uploads saved: ${uploadsFile}`)
}

const cutoff = Date.now() - KEEP_DAYS * 86_400_000
for (const name of fs.readdirSync(dir)) {
  if (!/^(hostel-\d{4}-\d\d-\d\d\.db|uploads-\d{4}-\d\d-\d\d\.tgz)$/.test(name)) continue
  const file = path.join(dir, name)
  if (fs.statSync(file).mtimeMs < cutoff) {
    fs.rmSync(file)
    console.log(`Deleted old backup: ${name}`)
  }
}
