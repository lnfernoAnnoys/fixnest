-- "Common area" is a location choice on the complaint form, so it no longer needs to be a problem category as well.
-- Hidden rather than deleted, so complaints already filed under it keep their label.
UPDATE categories SET active = 0 WHERE name = 'Common Area';
