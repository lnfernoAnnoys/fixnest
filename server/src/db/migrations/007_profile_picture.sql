-- A picture the person uploaded themselves. It wins over the Google photo (users.avatar_url) when both exist.
ALTER TABLE users ADD COLUMN avatar_path TEXT;
