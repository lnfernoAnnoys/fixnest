-- migrate: foreign-keys-off
-- Room QR codes were removed from FixNest, so rooms no longer carry a QR token. SQLite cannot drop a UNIQUE column in
-- place, so the rooms table is rebuilt with every room copied across unchanged (same ids, so students' rooms and
-- complaints still point at the right room). The runner turns foreign keys off for this file and checks every
-- reference before it commits.
CREATE TABLE rooms_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostel_id INTEGER NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
  floor INTEGER NOT NULL DEFAULT 0,
  number TEXT NOT NULL,
  UNIQUE (hostel_id, number)
);

INSERT INTO rooms_new (id, hostel_id, floor, number)
SELECT id, hostel_id, floor, number FROM rooms;

DROP TABLE rooms;
ALTER TABLE rooms_new RENAME TO rooms;
