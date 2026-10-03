# Hostel Maintenance & Complaint Tracker: Roadmap

Single-hostel web app. Roles: **student**, **staff**, **admin/warden**.
Stack: Node + Express 5 + TypeScript, SQLite (`node:sqlite`), Zod, JWT in httpOnly cookie, multer.
Client: Vite + React + TypeScript, Tailwind v4, React Router, TanStack Query, Motion, Recharts, Sonner.

Each phase ends with a working, tested slice. Nothing moves on until the current phase is verified.

## Phase 1: Foundation
- [x] npm workspaces (`server`, `client`), `.gitignore`, `.env.example`
- [x] SQLite schema + migration runner (users, hostels, rooms, profiles, categories, complaints, status_history, notifications)
- [x] Auth: register (students), login, logout, `/me`, bcrypt, JWT cookie, rate limiting
- [x] Role middleware + ownership checks (enforced on the API, not just the UI)
- [x] Central error handler, Zod validation helper
- [x] Seed script (separate from app startup): hostels, rooms, categories, demo users
- **Done when:** curl tests confirm login works, wrong roles get 403, and students can't read others' data.

## Phase 2: Student experience
- [x] Complaint API: create, list own, detail with timeline, cancel, add info
- [x] Complaint IDs (`HST-1042`), status history rows on every change
- [x] Photo upload: MIME whitelist, 5 MB cap, generated filenames, authorized file route
- [x] ~~QR: `/r/:token` resolves to hostel/floor/room~~ (removed later: students choose their hostel and type their room instead)
- [x] In-app notifications (`notify()` service, unread count, mark read)
- [x] UI: app shell, login/register, **mobile-first complaint form**, my complaints, complaint detail + status timeline, notification bell
- [x] ~~Scanner~~ (removed)

## Phase 3: Staff experience
- [x] Assigned queue (what / where / who / how urgent)
- [x] Acknowledge, In Progress, progress notes, resolution note + proof photo, mark Fixed
- [x] Staff can only touch complaints assigned to them
- [x] Student is notified at each step

## Phase 4: Admin experience
- [x] Dashboard: totals, pending/assigned/in-progress/resolved, high-priority, avg resolution time, by category, by hostel, recent, overdue
- [x] Complaint management: search (ID, student, room, hostel, category), filters (status, priority, category, hostel, date, staff), sorting (newest, oldest, priority, recently updated)
- [x] Assign staff, change priority, reject
- [x] Manage students, staff, hostels, rooms, categories
- [x] ~~QR management~~ (removed)

## Phase 5: Polish
- [x] Loading skeletons, empty states, error states, toasts, network-failure messages
- [x] Page/modal transitions, hover states (subtle)
- [x] Responsive pass: phone, tablet, laptop, desktop
- [x] Accessibility: focus states, labels, contrast, keyboard use
- [x] Security review: authz on every route, upload checks, headers, no secrets in the client
- [x] Demo data that looks populated; README with setup, env vars, demo accounts

## Added after the plan
- [x] Forgot password (emailed one-time link)
- [x] Email notifications (queued, retried, opt-out in Settings)
- [x] Profile pictures (upload, remove), students change their own hostel/room every 30 days
- [x] Short video attachments on a new complaint; "Common Area" removed as a category (it is a location choice)
- [x] Urgency blocks change colour, and High/Urgent ask for confirmation first
- [x] Welcome email for new students (designed HTML + text, sent once)
- [x] Room QR codes removed completely (pages, API, labels, database column)
- [x] Four roles: student, staff, warden, admin (warden cannot change setup or manage wardens); nobody can delete a complaint
- [x] Students choose their hostel from the admin's list and type their room number (letters allowed); only the admin can add a hostel
- [x] Active devices in Settings (log one out, or all others); mobile number (unverified)

## Decisions (confirmed)
1. **Name:** FixNest.
2. **Signup:** required before login, college email only (`@students.isquareit.edu.in`, set in config), then a 6-digit emailed code. Dev prints the code to the server console; SMTP later.
3. **Priority:** students pick it (default Medium); admin can change it.
4. **Overdue:** Urgent 24h, High 48h, Medium 72h, Low 7 days.
5. **Look and feel:** dark sidebar + light content, indigo accent (#4f46e5), rounded cards. Users pick light or dark mode with a toggle (default follows their system). Colors are CSS tokens for both modes from the start.
6. **UI kits:** Relume for the landing page, app shell and dashboard blocks; shadcn for dialogs, dropdowns, toasts.
7. **Backend:** custom Express + SQLite (not Appwrite).
8. **Domain:** your-domain.example (registered; use at deploy time).
9. **Google sign-in:** built. Existing accounts of any role can use Google if the verified email matches; new accounts only for student-domain emails. Needs `GOOGLE_CLIENT_ID` in `server/.env`.
10. **Icons:** Icons8 SVGs (iOS Outlined) in `client/src/assets/icons8/`.
11. **Local first:** no deployment work until the app is about 80% done.

## Already scaffolded (no features yet)
Root `package.json` (workspaces), `.gitignore`, `server/` package with dependencies, `tsconfig.json`, `.env.example`, `src/config.ts`, `src/db/{connection,migrate}.ts`, `migrations/001_init.sql`. The `client/` folder is still the default Vite JavaScript template and will be converted to TypeScript in Phase 2.
