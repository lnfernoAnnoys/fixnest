-- migrate: foreign-keys-off
-- Adds the 'warden' role (students, staff, wardens, admins). SQLite cannot change a CHECK constraint in place, so the
-- users table is rebuilt and every row is copied across unchanged. The runner turns foreign keys off for this file
-- (dropping a table they point to would otherwise delete rows elsewhere) and checks every reference before it commits.
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','staff','warden','admin')),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  google_sub TEXT,
  avatar_url TEXT,
  session_version INTEGER NOT NULL DEFAULT 0,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  avatar_path TEXT
);

INSERT INTO users_new (id, name, email, password_hash, role, phone, active, email_verified, created_at, google_sub, avatar_url, session_version, email_notifications, avatar_path)
SELECT id, name, email, password_hash, role, phone, active, email_verified, created_at, google_sub, avatar_url, session_version, email_notifications, avatar_path FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

-- The demo "warden" account is a warden, not the system admin.
UPDATE users SET role = 'warden' WHERE email = 'warden@fixnest.demo';
