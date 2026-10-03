-- A new student gets one welcome email. Students who already have a verified account were here before this existed,
-- so they are marked as already welcomed and are not emailed out of the blue.
ALTER TABLE users ADD COLUMN welcomed_at TEXT;
UPDATE users SET welcomed_at = datetime('now') WHERE role = 'student' AND email_verified = 1;
