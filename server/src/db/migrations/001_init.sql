CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','staff','admin')),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE email_verifications (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE hostels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
  floor INTEGER NOT NULL DEFAULT 0,
  number TEXT NOT NULL,
  qr_token TEXT NOT NULL UNIQUE,
  UNIQUE (hostel_id, number)
);

CREATE TABLE student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hostel_id INTEGER REFERENCES hostels(id),
  room_id INTEGER REFERENCES rooms(id),
  enrollment_no TEXT
);

CREATE TABLE staff_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT,
  employee_code TEXT
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  hostel_id INTEGER NOT NULL REFERENCES hostels(id),
  room_id INTEGER REFERENCES rooms(id),
  location_note TEXT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','assigned','in_progress','fixed','rejected','cancelled')),
  assigned_staff_id INTEGER REFERENCES users(id),
  image_path TEXT,
  resolution_note TEXT,
  resolution_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at TEXT,
  resolved_at TEXT
);
CREATE INDEX idx_complaints_student ON complaints(student_id, created_at);
CREATE INDEX idx_complaints_staff ON complaints(assigned_staff_id, status);
CREATE INDEX idx_complaints_status ON complaints(status, priority);
CREATE INDEX idx_complaints_hostel ON complaints(hostel_id);
CREATE INDEX idx_complaints_created ON complaints(created_at);

CREATE TABLE status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('status','note','priority','assignment')),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_complaint ON status_history(complaint_id, id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, id);
