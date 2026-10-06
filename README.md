# ParsonXam

Parsons-puzzle revision exams. Teachers build exams, students solve them by drag and drop, results are exportable as JSON.

- `SPEC.md` – what we are building and why
- `tasks/plan.md`, `tasks/todo.md` – implementation plan and task list
- `.claude/skills/create-puzzle-json/` – skill (format, rules, validator) for agents that write puzzle JSON files to import on the exam page
- Figma: https://www.figma.com/design/lEmNfY0spkvq753zbR48SL

## Packages

| Folder | What | Hosted on |
|---|---|---|
| `backend/` | Hono API + MySQL | Uberspace or similar (`<your domain>/api`) |
| `teacher/` | Teacher SPA | Uberspace or similar (`<your domain>`) |
| `student/` | Student SPA | GitHub Pages (`<owner>.github.io/<repository>`) |

## Local development

```bash
docker compose up -d            # MariaDB on :3306
cd backend
cp .env.example .env
npm install
npm run dev                     # API on :3000
npm test                        # needs the database above
```

## Deployment

See `docs/deployment.md`. Server login, domain and sender address are configuration (`.deploy.env`, `backend/.env`, a GitHub variable), never part of the code.

## Workflow

Trunk-based: one short-lived branch per task from `tasks/todo.md`, atomic commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), merged into `main` when tests and lint pass.
