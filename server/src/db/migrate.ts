import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './connection.js'

/**
 * Applies any *.sql files in ./migrations that have not been applied yet, in filename order.
 *
 * A file that rebuilds a table other tables point to (SQLite cannot change a CHECK in place) starts with the line
 * `-- migrate: foreign-keys-off`. Foreign keys must be off while such a table is dropped, or the drop would delete
 * rows in the tables that reference it. The runner then checks every reference again before it commits.
 */
export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))')
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
  const done = new Set((db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name))
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    const rebuild = /^--\s*migrate:\s*foreign-keys-off\s*$/m.test(sql)
    if (rebuild) db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      db.exec(sql)
      if (rebuild) {
        const broken = db.prepare('PRAGMA foreign_key_check').all()
        if (broken.length) throw new Error(`${file} would leave ${broken.length} broken references; nothing was changed.`)
      }
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
      db.exec('COMMIT')
      console.log(`[migrate] applied ${file}`)
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    } finally {
      if (rebuild) db.exec('PRAGMA foreign_keys = ON')
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) migrate()
