# Handoff: where we stopped

Last updated after Checkpoint C (tasks 1–18 merged into `main`, working tree clean).

## Done
Backend (Hono + MySQL/MariaDB): teacher passwordless login, classes with owner/member teachers, exams, puzzles, student join/lookup/start/autosave/submit, scoring, timeout settling (lazy + 30 s sweeper), review after exam over. 132 tests.
Teacher app (SvelteKit SPA): login, classes + sharing, exam list, exam settings, puzzle editor (paste-to-split). 12 unit tests.
Student app (SvelteKit SPA): code → name → ready → exam (drag and drop, autosave, countdown) → wait → review, plus not-found / not-open / closed screens. 19 unit tests.

## Next (see `tasks/todo.md`)
- 19 Results API + JSON export (`routes/results.ts`): results list, attempt detail, delete attempt, export in the shape from SPEC.md. Call `finaliseOverdue(db, now, examId)` before reading results. Also: `studentCount` on class cards, `submissionCount` is already on exams.
- 20 Results UI (Figma T5/T6): stats, table with "time ran out" marker, Export JSON button, submission detail, delete attempt. Add Submissions column to the exam table in class detail.
- 21 Responsive polish (tablet 820 / phone 390 per Figma), 22 Deployment, 23 Playwright e2e.

## Run locally
```
docker compose up -d                 # MariaDB (Docker Desktop must be running)
cd backend && cp .env.example .env && npm install && npm run dev      # :3000
cd teacher && npm install && npm run dev                              # :5174
cd student && npm install && npm run dev                              # :5173
cd backend && npm run teacher:add -- you@example.com "Your Name"      # create a teacher; login links print in the backend console
```
Checks: `npm test` and `npm run lint` in backend; `npm run check` and `npm test` in teacher and student.

## Facts worth remembering
- Local dev DB already has teachers michael@mfreimueller.com and anna@mfreimueller.com plus demo classes/exams from manual test runs (not committed, safe to ignore or wipe with `docker compose down -v`).
- SvelteKit 3 differences: imports use `#lib/...` with `.js` suffix for `.ts` files (e.g. `#lib/api.js`); student app navigates with `go()` from `#lib/nav.ts` because `resolve()` is typed per route.
- MariaDB reserved words bite (`lines`): alias carefully. Timestamps are written from JS in UTC.
- Student piece ids are random; scoring compares code+indent per position, so identical lines are interchangeable.
- Drag and drop has only been tested with mouse, emulated touch and keyboard; a real iPad test is still open.
- Not designed in Figma: landscape tablet; Exams/Settings sidebar items are intentionally absent.

## Deployment inputs (task 22)
Host `mf9501@sabic.uberspace.de`, domain `parsonxam.mfreimueller.com` (API `/api` + teacher app), student app at `https://mfreimueller.github.io/parsonxam/` (build with `BASE_PATH=/parsonxam` and `VITE_API_URL=https://parsonxam.mfreimueller.com/api`). Mailbox `noreply@parsonxam.mfreimueller.com` still has to be created. Reference deploy script: `/Users/mf/git/_Personal/moku/backend/scripts/deploy.sh`.
