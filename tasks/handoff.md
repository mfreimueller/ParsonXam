# Handoff: where we stopped

Last updated after task 19 (tasks 1–19 merged into `main`, working tree clean).

## Done
Backend (Hono + MySQL/MariaDB): teacher passwordless login, classes with owner/member teachers, exams, puzzles, student join/lookup/start/autosave/submit, scoring, timeout settling (lazy + 30 s sweeper), review after exam over. 141 tests (results routes: `GET /exams/:id/results`, `GET /exams/:id/export`, `GET|DELETE /attempts/:id`; class cards carry `studentCount`).
Teacher app (SvelteKit SPA): login, classes + sharing, exam list, exam settings, puzzle editor (paste-to-split), results table + stats + Export JSON (`/exams/[id]/results`), submission detail with prev/next and delete (`/attempts/[id]`). 15 unit tests.
Student app (SvelteKit SPA): code → name → ready → exam (drag and drop, autosave, countdown) → wait → review, plus not-found / not-open / closed screens. 19 unit tests.

## Next (see `tasks/todo.md`)
- Task 21 was checked in desktop Chrome (tablet ≈ 800–820 px viewport; phone via a 390 px iframe) and found fine apart from the exam header, which is now two compact rows on phones. No student frames were found in the Figma file, so it was not compared against designs, and it is still untested on a real device.
- Checkpoint D: Michael looks at the results UI (built, not yet seen in a browser) and grades a real mock exam.
- 22 Deployment, 23 Playwright e2e.

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
Host: the Uberspace account, kept out of the repo (see `docs/deployment.md`); domain `parsonxam.mfreimueller.com` (API `/api` + teacher app), student app at `https://mfreimueller.github.io/parsonxam/` (the workflow uses the repository name as base path and the `API_URL` repository variable; scripts need `DEPLOY_TARGET` and `DEPLOY_DOMAIN`). Mailbox `noreply@mfreimueller.com` still has to be created (it replaces the earlier `noreply@parsonxam…` plan). The scripts, workflow and docs are written (`scripts/`, `.github/workflows/deploy-student.yml`, `docs/deployment.md`) but have NOT been run.
