-- Forgot password: one-time reset links. Only a hash of each link's token is stored.
CREATE TABLE password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

-- Email notifications: a per-person switch, and a delivery queue kept alongside each in-app notification.
-- Existing notifications default to 'skipped' so nobody is emailed about the past.
ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN email_status TEXT NOT NULL DEFAULT 'skipped' CHECK (email_status IN ('pending','sent','failed','skipped'));
ALTER TABLE notifications ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN email_next_at TEXT;
ALTER TABLE notifications ADD COLUMN email_error TEXT;
ALTER TABLE notifications ADD COLUMN emailed_at TEXT;
CREATE INDEX idx_notifications_email_queue ON notifications(email_status, id) WHERE email_status = 'pending';
