# Task list

Note: the sidebar only has "Classes" for now (the Figma sidebar also shows Exams and Settings, which have no pages in the spec).

Convention: each task = one branch `feature/<slug>` → merged to `main`. Verify = tests + `npm run lint` (backend) / `npm run check` (apps) + the manual check listed.

## Phase 1: Foundation
- [x] **1. Repo scaffold** `chore/scaffold`
  - Acceptance: root `README.md` (how to run each package), `.env.example` files, CI workflow running lint + test for changed packages.
  - Verify: workflow passes on a push; Files: `README.md`, `.github/workflows/ci.yml`, `backend/.env.example`
- [x] **2. Backend skeleton** `feature/backend-skeleton`
  - Acceptance: `GET /api/health` returns ok and DB status; migrations run at startup; CORS allows the configured origins only; error format `{error, message}`; test DB helper creates/drops a throwaway database.
  - Verify: `npm test`, `npm run build && npm start`, `curl localhost:3000/api/health`; Files: `src/index.ts`, `src/db/{sql,connection,migrate}.ts`, `src/middleware/cors.ts`, `tests/health.test.ts`
- [x] **3. Auth tables and teacher seeding** `feature/teacher-tables`
  - Acceptance: migration 0001 creates `teachers`, `login_tokens`, `teacher_sessions`; `npm run teacher:add -- <email> "<name>"` inserts a teacher.
  - Verify: migration test; run the script twice (second run reports "exists"); Files: `migrations/0001_*.ts`, `scripts/add_teacher.ts`

## Phase 2: Teacher login
- [x] **4. Magic-link auth API** `feature/teacher-auth-api`
  - Acceptance: `request-link` always 202 and rate-limited; mail sent only for known teachers; `verify` is single use and 15 min; sessions are Bearer, 30 days; `logout`, `me`.
  - Verify: tests for unknown email, expired, reused, rate limit, session auth; Files: `routes/teacher_auth.ts`, `middleware/{teacher_auth,rate_limit}.ts`, `lib/{mailer,token,hash}.ts`
- [x] **5. Teacher app: scaffold and login** `feature/teacher-login-ui`
  - Acceptance: SvelteKit static SPA; design tokens from Figma; login, check-inbox, link-expired and verify routes work against the real API; protected layout redirects to login; logout.
  - Verify: `npm run check`; manual: request link (printed in backend console), open it, land on an empty classes page; Files: `teacher/src/{app.css,lib/api.ts,lib/auth.ts,routes/**}`

### Checkpoint A (after 5)
- [x] Teacher can sign in locally end to end; all tests green; branch history is clean. Review with Michael.

## Phase 3: Classes and teachers
- [x] **6. Classes and members API** `feature/classes-api`
  - Acceptance: spec routes for classes and members; owner/member rules; non-members get 404; `GET /classes` returns `myRole` and member initials.
  - Verify: tests incl. removed-member loses access, owner cannot leave; Files: `migrations/0002_*.ts`, `routes/classes.ts`, `lib/membership.ts`, tests
  - Follow-ups: `examCount` and `studentCount` on class cards are added in task 8 / 12 (tables do not exist yet); task 8 must also make `DELETE class` refuse while exams exist.
- [x] **7. Classes UI** `feature/classes-ui`
  - Acceptance: classes grid (Figma T1) incl. shared info and create dialog; class detail shell (T2) with Teachers button and dialog (T2b); owner-only controls hidden for members.
  - Verify: manual with two seeded teachers; `npm run check`

## Phase 4: Exams and puzzles
- [x] **8. Exams API** `feature/exams-api`
  - Acceptance: migration 0003 (`exams`, `puzzles`, `puzzle_lines`); exam CRUD, access code generation (unique, alphabet), publish/unpublish with validation, `regenerate-code`, `lib/exam_phase.ts`; list returns status and counts.
  - Verify: unit tests for phase + code; integration for validation errors; Files: `migrations/0003_*.ts`, `routes/exams.ts`, `lib/{access_code,exam_phase}.ts`
- [x] **9. Puzzles API** `feature/puzzles-api`
  - Acceptance: create/replace/delete puzzle with full line list (solution order + red herrings), reorder puzzles, `public_id` per line, structure locked once attempts exist.
  - Verify: tests incl. replace keeps ids stable where possible; Files: `routes/puzzles.ts`, tests
- [x] **10. Exam list and settings UI** `feature/exam-settings-ui`
  - Acceptance: exam table in class detail (T2); exam settings page (T3) with details, timing (Vienna time ↔ UTC), indentation checkbox, puzzle list, code box + copy, publish/unpublish.
  - Verify: manual; save → reload shows same values; timezone round-trip test
- [x] **11. Puzzle editor UI** `feature/puzzle-editor-ui`
  - Acceptance: editor (T4): task fields, solution lines with indent buttons, red herrings, add/remove/reorder lines, student preview shuffle, save.
  - Verify: manual; unit test for the reorder/indent helpers

### Checkpoint B (after 11)
- [x] A teacher can build and publish a full exam in the UI and see its code. Review with Michael (UX check against Figma).

## Phase 5: Student backend
- [x] **12. Attempts: join, start, get** `feature/attempts-api`
  - Also: once an exam has attempts, puzzle create/replace/delete/reorder and `unpublish` return 409 `EXAM_LOCKED` (not possible earlier, no attempts table yet). Add `submissionCount` to the exam list.
  - Acceptance: migration 0004 (`attempts`, `attempt_puzzles`); `join` with all error codes and rate limit; `start` idempotent and sets deadline; `GET attempt` for `joined` and `in_progress` with seeded shuffle; student Bearer middleware.
  - Verify: tests for each error, duplicate name, shuffle stable per seed; Files: `migrations/0004_*.ts`, `routes/student.ts`, `middleware/student_auth.ts`, `lib/shuffle.ts`
- [x] **13. Scoring, autosave, submit, finalise, sweeper** `feature/scoring-and-submit`
  - Acceptance: `lib/scoring.ts` per spec assumptions (lines compare by code + indent, so identical lines are interchangeable); autosave validation; manual submit; timeout finalisation lazily and via sweeper; idempotent.
  - Verify: exhaustive scoring unit tests; fake-clock tests for timeout; Files: `lib/{scoring,finalise,sweeper}.ts`, `routes/student.ts`
- [x] **14. Student view after submit and review** `feature/student-review-api`
  - Acceptance: `submitted` payload (score only while exam running; full review once over); single serializer `lib/student_view.ts`.
  - Verify: **leak test** scans every student response before exam over for solution-only fields; Files: `lib/student_view.ts`, tests

## Phase 6: Student app
- [x] **15. Student app: scaffold and join flow** `feature/student-join-ui`
  - Acceptance: SvelteKit static SPA with `/parsonxam` base and 404 fallback; screens S1, S1b, S2, S3, S8, S9; token in `localStorage`; resume on reload.
  - Verify: manual against local backend for each error code; `npm run check`
- [x] **16. Drag-and-drop component** `feature/student-dnd`
  - Acceptance: pieces ⇄ solution list with touch, mouse and keyboard; indent buttons when enabled; emits placed order; no accidental scroll hijack on tablets.
  - Verify: component tests + manual on a real tablet; Files: `student/src/lib/Puzzle.svelte`, tests
- [x] **17. Exam screen** `feature/student-exam-ui`
  - Acceptance: S4/S4b: puzzle navigation, autosave after each move (debounced, retry on failure with visible state), countdown from `serverNow`/`deadlineAt`, confirm dialog, auto-submit when the countdown hits zero.
  - Verify: manual full run; kill network mid-exam → reconnect → state preserved
- [x] **18. Waiting and review screens** `feature/student-review-ui`
  - Acceptance: S6 with live countdown to `closesAt`; S7 side by side, read-only, puzzle tabs; screen switches automatically when the exam ends.
  - Verify: manual with short exam times

### Checkpoint C (after 18)
- [x] Full flow: teacher publishes, 3 browser students take it (one lets time run out), all see the right screens. Review with Michael.

## Phase 7: Results and export
- [x] **19. Results API and export** `feature/results-api`
  - Acceptance: results list, attempt detail, delete attempt, export JSON matching the spec shape.
  - Verify: tests; export scores equal list scores; Files: `routes/results.ts`, tests
- [x] **20. Results UI** `feature/results-ui`
  - Acceptance: T5 results with stats, auto-submit marker, Export JSON; T6 submission detail; delete attempt.
  - Verify: manual with the Checkpoint C data

### Checkpoint D (after 20)
- [ ] Feature complete locally. Michael grades a real mock exam.

## Phase 8: Ship
- [x] **21. Responsive polish** `feature/responsive`
  - Acceptance: tablet (820) and phone (390) layouts per Figma for all student screens; teacher app usable at 1024.
  - Verify: manual on devices
- [x] **22. Deployment (written, not yet run on the server)** `chore/deploy`
  - Acceptance: `scripts/deploy-backend.sh`, `deploy-teacher.sh`, supervisord service, `uberspace web backend` + domain, mailbox, `.htaccess`, GitHub Pages workflow; `docs/deployment.md`.
  - Verify: `curl https://parsonxam.mfreimueller.com/api/health`; real login mail arrives; CORS from `mfreimueller.github.io` works
- [ ] **23. End-to-end tests** `test/e2e`
  - Acceptance: Playwright flows: teacher builds exam; student takes and submits; timeout; review after end; no solution data in student traffic.
  - Verify: `npx playwright test` in CI

### Checkpoint E (after 23)
- [ ] All success criteria in `SPEC.md` met. Ready for the first real class.

## Phase 9: Template puzzles (see SPEC.md "Template puzzles")
All on branch `feature/template-puzzles`, one atomic commit (or a few) per task. Verify each task with `npm test` + `npm run lint` (backend) / `npm run check` + `npm test` (apps), reading the summary lines.

- [x] **24. Template parser and scorer** (pure functions)
  - Acceptance: `backend/src/lib/template.ts` parses a template into lines of segments, gaps (expected texts, anyOrder, empty), solution pieces and errors with line numbers per the syntax rules; builds pool tiles from solution + herrings + reusable; `backend/src/lib/scoring.ts` gains `templatePercent(gaps, placedTexts)` (LCS / multiset) and a helper that returns per-piece `correct` flags. Teacher copy `teacher/src/lib/template.ts` byte-identical, guarded by a backend test.
  - Verify: unit tests: escapes, `~`, `{{}}` rules, multiple gaps per line, context lines, tabs, limits, whitespace normalisation; scoring examples (missing piece, extra piece, herring, empty gap filled, any-order permutation, nothing placed = 0, reusable used twice).
- [x] **25. Migration 0006 and teacher API**
  - Acceptance: `puzzles.kind`, `puzzles.template`, `puzzle_pieces`; create/replace/get/list/import accept and return both kinds; kind change allowed while unlocked; publish rule ≥ 2 pieces; `EXAM_LOCKED` unchanged.
  - Verify: migration test (existing puzzles become `lines`); route tests for template create/replace/get/import, validation errors carry line numbers, kind switch, publish rule.
- [x] **26. Student API: view and autosave**
  - Acceptance: `in_progress` payload per spec (segments, shuffled tiles, `kind`); autosave `{gaps}` validation; line puzzles unchanged apart from `kind`.
  - Verify: leak test extended: no expected texts per gap, no `~`, no herring/empty-gap flags before exam over; autosave tests (unknown gap, foreign piece, non-reusable twice rejected; reusable twice accepted; >20 per gap rejected).
- [ ] **27. Finalise, review, results, export**
  - Acceptance: finalise scores template puzzles with the new scorer; student review, teacher attempt detail, results list and export per spec.
  - Verify: tests: mixed exam (lines + template) scores; export scores equal results scores; review payload shape.

### Checkpoint F (after 27)
- [ ] Backend complete; all suites green. Report to Michael.

- [ ] **28. Student UI: `TemplatePuzzle.svelte`**
  - Acceptance: per spec UI section: inline gaps, pool chips, reusable copy-on-drag, tap/keyboard path, reorder inside a gap, restore from saved state, autosave via existing `Autosaver`; exam and review screens switch on `kind`.
  - Verify: component/unit tests for state helpers (add/remove/move, reusable copies, serialisation to `{gaps}`); `npm run check`; manual run at 1280, 820 and 390 px.
- [ ] **29. Teacher editor for templates**
  - Acceptance: kind switch, template editor with Mark-as-piece and Any-order buttons, live preview + errors, piece list with reusable checkboxes, red herrings, student preview; results and attempt detail render template puzzles.
  - Verify: unit tests for the wrap/toggle helpers; manual: build the JPA and the SQL example from the spec, publish, take as a student.

### Checkpoint G (after 29)
- [ ] Michael builds a JPA and an SQL puzzle, takes them as a student, checks results and export.

- [ ] **30. Docs and skill**
  - Acceptance: `docs/puzzle-import.md` describes both shapes; `.claude/skills/create-puzzle-json` (SKILL.md, example.json, validate.mjs) supports template puzzles; `tasks/handoff.md` updated.
  - Verify: `validate.mjs` accepts the example, which imports successfully.
