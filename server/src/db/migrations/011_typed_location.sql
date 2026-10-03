-- A student who signs up types their hostel and room. Those words wait here until the email is verified, and only
-- then are matched to (or added to) the hostel and room lists.
ALTER TABLE student_profiles ADD COLUMN pending_hostel TEXT;
ALTER TABLE student_profiles ADD COLUMN pending_room TEXT;
