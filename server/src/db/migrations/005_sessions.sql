-- Bumping this number signs a person out everywhere (used when the warden resets a password or deactivates them).
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
