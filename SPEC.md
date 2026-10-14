# Spec: ParsonXam

Design: https://www.figma.com/design/lEmNfY0spkvq753zbR48SL (pages: Teacher, Student, Components)

## Objective

Teachers create **revision exams** made of **Parsons puzzles** (code lines the student must put in the right order, optionally mixed with **red herrings**, i.e. lines that do not belong). Students join with a per-exam code, enter a name, solve the puzzles by drag and drop and submit. Teachers see every student's name, score and arrangement, and can export everything as JSON.

Users:
- **Teacher** (a handful of people, accounts are created manually in the DB). Passwordless login by emailed link. A class can have several teachers (team teaching, or a colleague running the revision in your place).
- **Student** (no account). Identified only by an access code plus a typed name.

Success looks like: a teacher can build an exam in minutes, hand out a code, and 25 students on tablets can take it at once without anyone seeing a solution early or losing work when the timer runs out.

### Assumptions (correct me if wrong)
1. Scoring per puzzle = correctly placed solution lines ÷ solution lines. A slot is correct only if the right line is at that exact position (and, when "students set indentation" is on, with the right indent). A red herring in a slot is simply wrong. Exam score = mean of the puzzle scores; an unanswered puzzle scores 0. No negative marking.
2. An exam has these phases, derived from timestamps: **draft** (not published) → **scheduled** (`now < opens_at`) → **live** → **over** (`now >= closes_at`). "Over" is the teacher's "exam over" time.
3. Students can start only while live. An attempt started before `closes_at` may run to its own deadline even if that is after `closes_at` (nobody is kicked out).
4. Attempt deadline = `started_at + time_limit`. It is **not** capped by `closes_at`.
5. A student's solutions become visible only when the exam is over, even if they submitted early. Before that they see only their percentage.
6. Student names are unique per exam (case-insensitive). A duplicate join is rejected (`NAME_TAKEN`); a teacher can delete an attempt to let the student rejoin. A student who reloads the page resumes via the token in their browser.
6a. **Shared classes**: a class has one **owner** (its creator) and any number of **members**. All members, owner included, can create, edit, publish and delete exams and puzzles, and see all results and exports of the class. Only the owner can add or remove members, rename or delete the class; a member can leave a class. Teachers are added by email and must already have an account (no invitations, no registration). Ownership cannot be transferred (yet).
7. All timestamps are stored in UTC (`process.env.TZ = 'UTC'`, as in moku). The teacher UI shows and edits Europe/Vienna time.
8. The student app is public code. It must never receive solution data before the exam is over.

## Tech Stack

| Part | Choice |
|---|---|
| Backend | Node 20+, TypeScript, Hono + `@hono/node-server`, `mysql2` (via moku's `sql.ts` wrapper), `zod`, `nodemailer` |
| DB | MySQL/MariaDB on Uberspace, hand-written numbered migrations run on startup (as in moku) |
| Student app | Svelte 5 + SvelteKit (`adapter-static`, SPA, `ssr = false`), TypeScript, `svelte-dnd-action` (touch + keyboard) |
| Teacher app | Same stack as the student app |
| Tests | `vitest` (backend against a throwaway MySQL database), `svelte-check`, Playwright for a few end-to-end flows |
| Hosting | API + teacher app: the Uberspace account (`<user>@<host>`), domain `parsonxam.mfreimueller.com`. Student app: GitHub Pages at `https://mfreimueller.github.io/parsonxam/` |

## Commands

```
# backend/
npm run dev          # tsx watch src/index.ts
npm run build        # tsc -p tsconfig.build.json  -> dist/
npm start            # node dist/index.js
npm test             # vitest run
npm run lint         # tsc --noEmit

# student/ and teacher/
npm run dev          # vite dev (student :5173, teacher :5174)
npm run build        # vite build -> build/
npm run check        # svelte-check --tsconfig ./tsconfig.json

# repo root
scripts/deploy-backend.sh <user>@<host>   # tsc, rsync dist + package files, npm i --omit=dev, supervisorctl restart parsonxam-backend
scripts/deploy-teacher.sh <user>@<host>   # build teacher, rsync build/ to the domain's docroot
# student app: GitHub Action on push to main builds student/ and publishes to Pages
```

## Project Structure

```
backend/
  src/index.ts            app wiring, migrations, CORS, sweeper start
  src/db/                 connection.ts, sql.ts, migrate.ts, migrations/NNNN_*.ts
  src/routes/             teacher_auth.ts, classes.ts, exams.ts, puzzles.ts, results.ts, student.ts, health.ts
  src/middleware/         teacher_auth.ts, student_auth.ts, rate_limit.ts, cors.ts
  src/lib/                token.ts, hash.ts, mailer.ts, access_code.ts, scoring.ts, shuffle.ts, exam_phase.ts, sweeper.ts
  tests/
student/                  SvelteKit SPA: src/routes/(join|name|ready|exam|wait|review|closed)
teacher/                  SvelteKit SPA: src/routes/(login|classes|classes/[id]|exams/[id]|puzzles/[id]|results|submissions)
docs/                     deployment notes
scripts/                  deploy scripts
.github/workflows/        student Pages deploy, CI (lint + test + check)
SPEC.md
```

## Data Model (MySQL, utf8mb4, UTC)

```
teachers(id, email UNIQUE, display_name, created_at)
login_tokens(id, teacher_id, token_hash UNIQUE, expires_at, used_at)      -- 15 min, single use
teacher_sessions(id, teacher_id, token_hash UNIQUE, expires_at)           -- 30 days, Bearer

classes(id, name, term, created_at)
class_members(class_id, teacher_id, role ENUM('owner','member'), added_at, PRIMARY KEY(class_id, teacher_id))
                                                                         -- exactly one 'owner' per class
exams(id, class_id, title, instructions, time_limit_seconds,
      opens_at, closes_at, access_code UNIQUE, students_indent BOOL,
      published_at NULL, created_at)
puzzles(id, exam_id, position, title, description)
puzzle_lines(id, puzzle_id, public_id CHAR(12) UNIQUE,
             solution_position INT NULL,  -- NULL = red herring
             code TEXT, indent TINYINT)

attempts(id, exam_id, student_name, name_key, token_hash UNIQUE, shuffle_seed,
         joined_at, started_at NULL, deadline_at NULL,
         submitted_at NULL, submit_reason ENUM('manual','timeout') NULL,
         score_percent DECIMAL(5,2) NULL,
         UNIQUE(exam_id, name_key))
attempt_puzzles(attempt_id, puzzle_id, state JSON,        -- [{pieceId, indent}] in placed order
                score_percent DECIMAL(5,2) NULL, updated_at, PRIMARY KEY(attempt_id, puzzle_id))
```

Notes:
- `public_id` is random and carries no order information, so it is safe to send to students.
- Deleting an exam, puzzle or attempt cascades; deleting a class with exams is refused (the owner must delete the exams first). Deleting a class removes its memberships.
- Every teacher route that touches a class, exam, puzzle or attempt resolves the class and checks `class_members` for the logged-in teacher. A non-member gets `404` (not `403`) so ids and emails are not probed.
- `access_code`: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1), shown as `ABC-234`. Input is normalised (strip dashes/spaces, uppercase).

## Attempt lifecycle

```
(join) joined ──start──▶ in_progress ──submit──▶ submitted (manual)
                              │
                              └─ deadline passes ─▶ submitted (timeout, last autosaved state)
```

- **Join** (`code` + `name`): exam must be published and `now < closes_at`. Creates the attempt and returns the student token.
- **Start**: sets `started_at`, `deadline_at`. Idempotent (a second call returns the same deadline).
- **Autosave**: the client sends the full arrangement of one puzzle after every move. Rejected with `409 ATTEMPT_SUBMITTED` once submitted.
- **Finalise** (manual submit, or timeout): scores every puzzle from the stored state, writes `score_percent`, sets `submitted_at`. Timeout finalisation runs (a) lazily on any student request or teacher read once `now >= deadline_at`, and (b) from a sweeper (`setInterval`, 30 s) so results are complete even if the browser is closed. Finalisation is idempotent and transactional.

## API

All JSON. Errors: `{ "error": "<CODE>", "message": "..." }`. Teacher routes need `Authorization: Bearer <teacher session>`, student routes `Bearer <attempt token>`.

### Teacher auth
| Route | Notes |
|---|---|
| `POST /api/teacher/auth/request-link {email}` | Always `202`, never reveals whether the email exists. Rate limit 5 per 15 min per email and per IP. Mails `https://parsonxam.mfreimueller.com/auth/verify?token=...` |
| `POST /api/teacher/auth/verify {token}` | Single use, 15 min. Returns `{ token, expiresAt, teacher }`. `LINK_EXPIRED` / `LINK_INVALID` |
| `POST /api/teacher/auth/logout`, `GET /api/teacher/me` | |

### Teacher content (membership checked on every route, see Data Model notes)
| Route | Notes |
|---|---|
| `GET/POST /api/teacher/classes`, `PATCH/DELETE /api/teacher/classes/:id` | `GET` returns every class the teacher belongs to with `myRole`, `members` (initials, name) and exam/student counts. `PATCH`/`DELETE`: owner only |
| `GET /api/teacher/classes/:id/members`, `POST .../members {email}`, `DELETE .../members/:teacherId` | `POST`/`DELETE`: owner only, except a member may `DELETE` themselves (leave). Errors: `TEACHER_NOT_FOUND` (404, no account with that email), `ALREADY_MEMBER` (409), `OWNER_CANNOT_LEAVE` (409) |
| `GET/POST /api/teacher/classes/:id/exams` | list includes status, code, submission counts and `createdBy` |
| `GET/PATCH/DELETE /api/teacher/exams/:id` | PATCH rejects changes to puzzles' structure once the exam is published and has attempts |
| `POST /api/teacher/exams/:id/publish`, `POST .../unpublish`, `POST .../regenerate-code` | publish validates: ≥1 puzzle, every puzzle has ≥2 solution lines, `opens_at < closes_at`, `time_limit_seconds > 0` |
| `POST /api/teacher/exams/:id/puzzles`, `PUT/DELETE /api/teacher/puzzles/:id`, `PUT .../exams/:id/puzzles/order` | `PUT puzzle` replaces title, description and the full line list (solution lines in order + red herrings) |
| `GET /api/teacher/exams/:id/results` | stats + one row per attempt (name, submitted_at, reason, per-puzzle %, total %) |
| `GET /api/teacher/attempts/:id` | submission vs solution, per puzzle |
| `DELETE /api/teacher/attempts/:id` | lets a student rejoin |
| `GET /api/teacher/exams/:id/export` | `Content-Disposition: attachment; filename=<exam>.json` |

Export shape (versioned):
```json
{
  "version": 1,
  "exportedAt": "2026-10-17T10:02:11Z",
  "exam": { "title": "...", "class": "...", "timeLimitSeconds": 600, "opensAt": "...", "closesAt": "...", "studentsIndent": true,
            "puzzles": [{ "id": 1, "title": "...", "solution": [{"code": "n = 5", "indent": 0}], "redHerrings": ["print(n)"] }] },
  "results": [{ "studentName": "Anna Huber", "startedAt": "...", "submittedAt": "...", "submitReason": "manual",
                "scorePercent": 78.33,
                "puzzles": [{ "puzzleId": 1, "scorePercent": 75, "submitted": [{"code": "n = 5", "indent": 0, "correct": true}] }] }]
}
```

### Student
| Route | Notes |
|---|---|
| `POST /api/student/join {code, name}` | Errors: `CODE_NOT_FOUND` (404, also for unpublished exams), `EXAM_NOT_OPEN` (409, includes `opensAt`), `EXAM_CLOSED` (410), `NAME_TAKEN` (409), `VALIDATION` (name 1–60 chars). Rate limit 10/min per IP |
| `GET /api/student/attempt` | Phase-dependent payload, see below |
| `POST /api/student/start` | Starts the clock; returns deadline and the puzzles |
| `PUT /api/student/puzzles/:id/state {placed:[{pieceId,indent}]}` | Autosave |
| `POST /api/student/submit` | Returns `{ scorePercent, closesAt }` only |

`GET /api/student/attempt` returns:
- `joined`: exam title, class name, puzzle count, time limit, `closesAt`.
- `in_progress`: the above plus `deadlineAt`, `serverNow` (client corrects clock drift), and per puzzle `{id, title, description, pieces:[{pieceId, code, indent?}], placed}`. The shuffle is derived from `shuffle_seed`, so it is stable across reloads. `indent` is included only when `students_indent = false`; when true, pieces carry no indent and `placed` carries the student's indent.
- `submitted`, exam still running: `scorePercent`, `closesAt`.
- `submitted`, exam over: everything above plus per puzzle `submission` (with `correct` flags) and `solution` and `redHerrings`.

Only the teacher routes and the "exam over" branch ever return `solution_position`, correct code order or red herring flags.

## Cross-cutting rules

- **CORS**: allow exactly `https://mfreimueller.github.io` and `https://parsonxam.mfreimueller.com`; in development also `http://localhost:5173` and `:5174`. No cookies; Bearer tokens only.
- **Tokens**: random 32 bytes, only the SHA-256 hash is stored (moku's `token.ts` / `hash.ts`). The student token is kept in `localStorage` so a tab close or tablet reboot mid-exam does not lose the attempt. It is cleared when the exam is over and the review has been shown.
- **Validation**: every body parsed with `zod`; autosave checks piece ids belong to the puzzle, no duplicates, `indent` 0–6.
- **Rate limiting**: in-memory (one Node process); client IP from `X-Forwarded-For` as set by Uberspace's proxy.
- **Mail**: `nodemailer` over SMTP with an Uberspace mailbox; config through `SMTP_*` env vars (`SMTP_FROM=noreply@mfreimueller.com`; create the mailbox with `uberspace mail user add noreply` and make sure the domain is added to Uberspace mail). The link email is plain text plus HTML, subject "Your ParsonXam sign-in link".
- **Logging**: one line per request (method, path, status, ms), no tokens or student answers.

## Deployment

- `.env` on the server (never committed): `PORT=3000`, `DATABASE_URL`, `PUBLIC_TEACHER_URL=https://parsonxam.mfreimueller.com`, `ALLOWED_ORIGINS`, `SMTP_*`.
- Domain names below are the author's own. Domain, sender address and server login are all configurable; see `docs/deployment.md` (the server login never appears in the repo).
- Backend: supervisord service `parsonxam-backend` running `node dist/index.js`; `uberspace web backend set parsonxam.mfreimueller.com/api --http --port 3000`.
- Teacher app: static files in the docroot for `parsonxam.mfreimueller.com` with an `.htaccess` that rewrites unknown paths to `index.html`.
- Domain: add with `uberspace web domain add parsonxam.mfreimueller.com` and point DNS at the host.
- Student app: `VITE_API_URL=https://parsonxam.mfreimueller.com/api`, `paths.base = '/parsonxam'`, `404.html` copy of `index.html` for deep links on GitHub Pages.

## Code Style

Match moku: ES modules with `.js` import suffixes, tagged-template SQL, `zod` at the edge, thin routes, logic in `lib/`.

```ts
// routes/student.ts
student.post('/join', rateLimit({ max: 10, windowMs: 60_000 }), async (c) => {
  const body = joinSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'VALIDATION', message: 'Enter your name (1–60 characters).' }, 400);

  const db = getDb();
  const exam = await findExamByCode(db, normaliseCode(body.data.code));
  if (!exam || !exam.publishedAt) return c.json({ error: 'CODE_NOT_FOUND' }, 404);
  const phase = examPhase(exam, new Date());
  if (phase === 'over') return c.json({ error: 'EXAM_CLOSED' }, 410);
  if (phase === 'scheduled') return c.json({ error: 'EXAM_NOT_OPEN', opensAt: exam.opensAt }, 409);

  const { token, attemptId } = await createAttempt(db, exam, body.data.name);
  return c.json({ token, attemptId }, 201);
});
```

Conventions: `snake_case` columns, `camelCase` in TypeScript and JSON, error codes `UPPER_SNAKE`, one migration file per schema change, no default exports except Svelte components.

## Testing Strategy

- **Unit** (`lib/`): `scoring` (exact-position rule, red herrings, indent mode on/off, empty puzzle, extra pieces), `examPhase`, `shuffle` (stable per seed), `accessCode` (alphabet, normalisation).
- **Integration** (Hono `app.request` + test MySQL like moku): teacher login flow incl. expired/used/unknown email; membership checks (a teacher outside the class gets 404 on its exams, results and export; a member can edit exams but cannot add/remove members or delete the class; the owner cannot leave; a removed member loses access immediately); join errors; start idempotency; autosave rejected after submit; timeout finalisation by lazy path and by sweeper; student payload **never contains** solution data before the exam is over (asserted by scanning the JSON for solution-only fields); export shape.
- **End to end** (Playwright, headless Chromium, tablet viewport): student joins with a code, drags pieces, submits, sees the waiting screen; after the exam time passes sees the review.
- Coverage target: all of `lib/` and every route has at least one happy-path and one failure test. No percentage gate.

## Boundaries

- **Always**: run `npm test` and `npm run lint` before committing; validate input with `zod`; check class membership on teacher routes; hash tokens; keep solutions out of student responses until the exam is over; add a migration instead of editing an applied one.
- **Ask first**: new dependencies; schema changes after the first deployment; changing the scoring rule; anything touching CORS or auth; changing the deploy scripts or CI.
- **Never**: commit `.env` or credentials; log tokens, codes or student answers; trust the client clock for deadlines; return `solution_position` to student routes; edit `dist/`.

## Success Criteria

1. A teacher requests a sign-in link, receives the email, opens it, and is logged in; the link works once and expires after 15 minutes. An unknown email gets the same response as a known one.
2. A teacher can create a class, an exam with 3 puzzles (with red herrings and the indentation option), publish it and get a code.
2a. The owner adds a colleague by email; the colleague sees the class, can run the exam and read the results; the owner removes them and access ends at once.
3. 30 students can join, start, and submit concurrently; each sees "You got N%" after submitting and a "please wait" screen until the exam is over.
4. A student whose time runs out, or who closed the tab, is recorded as `timeout` with the last autosaved arrangement within 30 s of the deadline.
5. After `closes_at`: new joins get `EXAM_CLOSED`; students still working can finish; every student sees submission and solution side by side, read-only.
6. Network traffic of the student app before the exam is over contains no solution order, no red herring flags and no correct-flags.
7. The exported JSON round-trips: scores in the file equal the scores shown in the teacher results.
8. Deploying the backend and the teacher app takes one command each; the student app deploys on push to `main`.

## Decisions taken

- Sign-in emails are sent from `noreply@mfreimueller.com` (the Uberspace mailbox still has to be created, see Deployment).
- Duplicate student names in one exam are rejected.
- A student who enters the code before `opens_at` sees an "exam hasn't started yet" screen with the opening time (Figma frame `S9`); `EXAM_NOT_OPEN` carries `opensAt`.
- Scoring stays strict (exact position), as approved.
- Multiple teachers per class with owner/member roles (Figma frames `T1` shared classes, `T2` teachers button, `T2b` teachers dialog).

## Template puzzles (puzzle kind `template`)

Added after v1. Makes ParsonXam language and technology agnostic: JPA mappings, REST controllers, SQL, config files. The existing line puzzles stay unchanged as kind `lines`; an exam may mix both kinds. Decisions (Michael, 2026-10-13): `{{…}}` markers, LCS scoring, "any order" gaps in v1, two puzzle kinds side by side.

### Idea
The teacher writes the real solution code and marks pieces inline. Everything outside markers is **fixed text** the student sees as given code. Marked pieces are removed and become drop **gaps**. A gap holds 0..n pieces; the student does not see how many. Pieces marked **reusable** appear once in the pool with an ∞ badge and can be placed any number of times (e.g. `SELECT`, `FROM`).

```sql
{{SELECT}} {{e.name}}
{{FROM}} {{employees e}}
{{WHERE}} {{e.salary > (}}
    {{SELECT}} {{AVG(x.salary)}} {{FROM}} {{employees x}}
    {{WHERE}} {{x.dept_id = e.dept_id}}
{{)}}
```
with `reusable: ["SELECT", "FROM", "WHERE"]` and `redHerrings: ["GROUP BY", "HAVING"]`.

```java
@Entity
public class Order {
    {{~@Id}} {{@GeneratedValue(strategy = GenerationType.IDENTITY)}}
    private Long id;
    {{}}
    private String note;
}
```

### Template syntax
- `{{text}}` marks one piece. The text is trimmed and must not be empty, except for the empty marker below.
- A **gap** is a maximal run of markers on one line separated only by spaces or tabs. One line may contain several gaps separated by fixed text, or none (pure context line).
- `{{}}` is an **empty gap**: the correct answer is to leave it empty (a decoy, so visible gaps do not give away where pieces go). It must stand alone, not in a run with other markers.
- A gap whose **first** marker starts with `~` (`{{~@Id}} {{@GeneratedValue}}`) is an **any-order gap**: scored as a multiset. The `~` is not part of the piece text. `{{~}}` is invalid.
- Escapes: `\{{` is a literal `{{` in fixed text; inside a marker `\}}` is a literal `}}` and a leading `\~` a literal `~`.
- Leading whitespace is fixed text (tabs become 4 spaces). Trailing whitespace on a line is dropped.
- Piece texts are compared after collapsing internal whitespace runs to one space.
- Limits: template ≤ 6000 characters and ≤ 80 lines; ≤ 30 gaps; ≤ 60 solution pieces; piece text ≤ 200 characters; ≤ 15 red herrings. Errors name the 1-based line number.
- `reusable`: list of piece texts (from the solution or the red herrings). Every entry must occur; duplicates are ignored. A reusable text is one pool tile however often it occurs in the solution. A non-reusable text that occurs twice (two `)`) gives two pool tiles.

### Scoring (template puzzles)
For each gap with expected pieces `E` and placed pieces `P` (compared by text):
- `match` = length of the longest common subsequence of `E` and `P`; for an any-order gap the size of the multiset intersection.
- `denom` = `max(|E|, |P|)`.

Puzzle % = `Σ match / Σ denom × 100`. Missing pieces, extra pieces, red herrings and anything placed in an empty gap lower the score. A puzzle with nothing placed scores 0. The exam score is unchanged (mean of puzzle %). For the review, a placed piece is **correct** if it is part of the chosen LCS (any-order: part of the intersection); the LCS backtrack prefers the earliest match so the result is deterministic.

### Data model
```
puzzles        + kind ENUM('lines','template') NOT NULL DEFAULT 'lines'
               + template MEDIUMTEXT NULL          -- teacher source incl. markers; NULL for kind 'lines'
puzzle_pieces(id, puzzle_id, public_id CHAR(12) UNIQUE, text VARCHAR(500),
              reusable BOOL, herring BOOL)         -- one row per pool tile, kind 'template' only
```
`puzzle_lines` is used only by kind `lines`. Saving a template puzzle re-parses the template and rewrites its `puzzle_pieces` (ids may change; editing is locked once attempts exist). The solution is always derived from `template` at scoring time.

`attempt_puzzles.state` for a template puzzle: `{"gaps": {"<gapIndex>": ["<pieceId>", ...]}}`. Gap indexes count gaps in reading order from 0.

### API changes
- Teacher `POST /exams/:id/puzzles` and `PUT /puzzles/:id` take a body discriminated by `kind` (default `lines`, current shape). Template body: `{kind:'template', title, description, template, redHerrings: string[], reusable: string[]}`. Changing the kind of an existing puzzle is allowed while the exam is not locked. `GET /puzzles/:id` returns the same fields plus `kind`. The puzzle list returns `kind` and, for templates, `pieceCount` / `gapCount` instead of line counts.
- Import file: each puzzle entry is either the current shape or the template shape above.
- Publish: a template puzzle needs ≥ 2 solution pieces.
- Student `GET /attempt` (`in_progress`), template puzzle: `{id, kind:'template', title, description, lines: Segment[][], pieces:[{pieceId, text, reusable}], placed:{gaps}}`, where `Segment = {text} | {gap: number}`. Pieces are shuffled with the attempt seed as today. The `~` flag, which gaps are empty and which pieces are herrings are never sent. Line puzzles get `kind:'lines'` added.
- Student autosave `PUT /puzzles/:id/state`: `{placed:[…]}` for line puzzles, `{gaps:{…}}` for template puzzles. Validation: known gap indexes, piece ids belong to the puzzle, a non-reusable piece at most once across all gaps, ≤ 20 pieces per gap.
- Review (exam over) and teacher attempt detail, template puzzle: `lines` with each gap as `{gap, expected:[text], submitted:[{text, correct}], anyOrder}`, plus `redHerrings`, `reusable` and `scorePercent`.
- Export: each puzzle gains `kind`; template puzzles carry `template`, `redHerrings`, `reusable` and their results carry `gaps: [{submitted:[{text, correct}]}]`. `version` stays 1 (additive; a missing `kind` means `lines`).
- "Students set indentation" does not apply to template puzzles (indentation is fixed text).

### UI
- **Student** (`TemplatePuzzle.svelte`): the code is rendered monospace with gaps as inline drop zones (dashed, min width, grow with content, wrap on narrow screens); the pool sits below as chips. Dragging a reusable chip out of the pool places a copy and leaves the chip. Tap/keyboard path for tablets and accessibility: a gap is selected by tap/focus (highlighted), Enter or tap on a pool chip appends it to the selected gap, Enter or tap on a placed chip returns it (a reusable copy just disappears). Pieces within a gap can be reordered by drag and by Alt+←/→.
- **Teacher** puzzle editor: choose "Line puzzle" or "Code template". Template mode: monospace editor with a "Mark as piece" button (wraps the selection in `{{ }}`) and an "Any order" button (toggles `~` on the gap's first marker), live preview of gaps and parse errors with line numbers, the derived piece list with a reusable checkbox per distinct text, red herrings (one per line, reusable checkbox), student preview. The parser is `backend/src/lib/template.ts`; the teacher app keeps a byte-identical copy at `teacher/src/lib/template.ts` (same approach as `tokens.css`), guarded by a backend test that compares the two files.
- Results / attempt detail / student review render template puzzles as code with gaps showing submitted chips marked correct/wrong and the expected pieces next to them.

## Open Questions

1. Should a member be able to see *who* created each exam? (The API returns `createdBy`; the exam table currently has no column for it.)
2. Should the owner be able to hand the class to a colleague (transfer ownership), for example when someone leaves the school? Not in v1 unless you say so.
