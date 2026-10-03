# ParsonXam

Parsons-puzzle revision exams. Teachers build exams, students solve them by drag and drop, results are exportable as JSON.

- `SPEC.md` – what we are building and why
- `tasks/plan.md`, `tasks/todo.md` – implementation plan and task list
- Figma: https://www.figma.com/design/lEmNfY0spkvq753zbR48SL

## Packages

| Folder | What | Hosted on |
|---|---|---|
| `backend/` | Hono API + MySQL | Uberspace (`parsonxam.mfreimueller.com/api`) |
| `teacher/` | Teacher SPA | Uberspace (`parsonxam.mfreimueller.com`) |
| `student/` | Student SPA | GitHub Pages (`mfreimueller.github.io/parsonxam`) |

## Local development

```bash
docker compose up -d            # MariaDB on :3306
cd backend
cp .env.example .env
npm install
npm run dev                     # API on :3000
npm test                        # needs the database above
```

## Workflow

Trunk-based: one short-lived branch per task from `tasks/todo.md`, atomic commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), merged into `main` when tests and lint pass.
