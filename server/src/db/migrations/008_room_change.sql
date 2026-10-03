-- When a student last moved themselves to another hostel or room (NULL = never, so the first change is free).
ALTER TABLE student_profiles ADD COLUMN location_changed_at TEXT;
