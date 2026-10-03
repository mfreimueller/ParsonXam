# Implementation Plan: ParsonXam

Source of truth: `SPEC.md`. Design: Figma file `lEmNfY0spkvq753zbR48SL`.

## Overview

A monorepo with three packages: `backend/` (Hono + MySQL on Uberspace), `teacher/` (SvelteKit SPA on Uberspace) and `student/` (SvelteKit SPA on GitHub Pages). Work is sliced vertically: each task delivers something that can be run and tested, backend first within a slice, then the screen that uses it.

## Architecture decisions

- **Backend before UI inside a slice.** The API contract in the spec is firm, so UI tasks code against real endpoints instead of mocks.
- **Dev mail goes to the console.** `mailer.ts` has a console transport when `SMTP_HOST` is unset, so login works locally without a mail server.
- **Design tokens once.** The Figma colour variables become CSS custom properties in a shared `tokens.css` copied into both apps (not a shared package; the two apps deploy separately and the file is 40 lines).
- **Scoring is a pure function** (`lib/scoring.ts`) so it can be tested exhaustively without a database.
- **The student payload is built in one function** (`lib/student_view.ts`) with a single leak test. Nothing else may serialise puzzle lines for students.
- **Git:** trunk-based. One short-lived branch per task (`feature/<task>`), atomic commits in `type: summary` form, merged into `main` with a merge commit after tests and lint pass. Every commit ends with the Co-Authored-By trailer.

## Dependency graph

```
scaffold ─ backend skeleton ─ auth tables ─ auth API ─┬─ teacher app + login
                                                      └─ classes API ─ classes UI
classes API ─ exams/puzzles API ─ exam settings UI ─ puzzle editor UI
exams API ─ attempts + join/start ─ scoring/submit/sweeper ─ student review view
student view ─ student app (join flow) ─ DnD component ─ exam screen ─ wait/review screens
attempts ─ results API ─ results UI ─ export
everything ─ responsive polish ─ deployment ─ e2e
```

## Phases

1. **Foundation** (tasks 1–3): repo, backend skeleton, migrations runner, test database.
2. **Teacher login** (4–5): magic link end to end.
3. **Classes and teachers** (6–7).
4. **Exams and puzzles** (8–11).
5. **Student backend** (12–14).
6. **Student app** (15–18).
7. **Results and export** (19–20).
8. **Ship** (21–23): responsive polish, deployment, end-to-end tests.

Checkpoints after tasks 5, 11, 18, 20 and 23 (see `todo.md`).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Drag and drop on iPad/Android tablets (touch, scrolling, drop targets) | High | Task 16 is isolated and built early in Phase 6; test on real tablet Safari/Chrome before the exam screen is built on top |
| Solutions leaking to the student app | High | Single serializer, leak test, response scanning in e2e |
| Uberspace proxy / CORS / `X-Forwarded-For` behave differently from local | Med | Deploy a bare health endpoint in task 22 *before* the full backend; test CORS from the real GitHub Pages origin |
| Timer drift and sweeper correctness | Med | Server-authoritative deadline, `serverNow` offset on the client, fake-clock tests for finalisation |
| Mail deliverability from the new mailbox | Med | Test the real mailbox in task 22; the spec's `request-link` always answers 202 so failures are logged server-side only |
| Svelte 5 + DnD library compatibility | Low | Verify `svelte-dnd-action` with Svelte 5 in task 16 spike; fallback is pointer-events based custom sorting |

## Open questions

None blocking.
