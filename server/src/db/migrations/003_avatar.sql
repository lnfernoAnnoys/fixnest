-- Profile picture. Set from the Google account when a user signs in with Google; otherwise the app shows initials.
ALTER TABLE users ADD COLUMN avatar_url TEXT;
