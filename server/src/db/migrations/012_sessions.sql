-- One row per signed-in browser or phone, so people can see where they are logged in and log a device out.
-- Deleting the row ends that login at once. (sv is the person's session_version at sign-in: a password reset or
-- deactivation bumps it, which also ends every login made before that.)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sv INTEGER NOT NULL DEFAULT 0,
  device TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id, last_seen_at);
