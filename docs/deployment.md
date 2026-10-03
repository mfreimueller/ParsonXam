# Deployment

ParsonXam runs in two places. Nothing about your deployment is hard-coded: domain, sender address and server are configuration, and `<placeholders>` below stand for your values.

| Placeholder | Meaning | Where it is configured |
|---|---|---|
| `<user>@<host>` | SSH login of the Uberspace (or any similar) server | `DEPLOY_TARGET` |
| `<domain>` | Public domain for the API (`/api`) and the teacher app, e.g. `exams.example.org` | `DEPLOY_DOMAIN`, `PUBLIC_TEACHER_URL`, `ALLOWED_ORIGINS` |
| `<sender>` | Address sign-in mails come from, e.g. `noreply@example.org` | `SMTP_FROM` and `SMTP_USER` |
| `<owner>`, `<repository>` | GitHub account and repository that host the student app | derived by the workflow; `API_URL` variable |

Layout:

| Part | Where | How it gets there |
|---|---|---|
| API (`backend/`) and teacher app (`teacher/`) | An Uberspace account, domain `<domain>` (API under `/api`, teacher app at the root) | `scripts/deploy-backend.sh`, `scripts/deploy-teacher.sh` |
| Student app (`student/`) | GitHub Pages, `https://<owner>.github.io/<repository>/` | GitHub Action on push to `main` |

## Keeping the server out of the repo

The repository is public, so it never contains the SSH login of the server. The scripts read it, and the domain, from outside:

```bash
cp .deploy.env.example .deploy.env          # gitignored; edit DEPLOY_TARGET and DEPLOY_DOMAIN
# or export DEPLOY_TARGET=user@host DEPLOY_DOMAIN=exams.example.org in your shell
./scripts/deploy-backend.sh                 # the target may also be passed as the first argument
```

Everything below uses `<user>` and `<host>` for the same reason. Do not paste real values into commits, issues or pull requests. Secrets (`.env` on the server) are never committed either.

## One-time server setup

Run these over SSH on the server. Nothing here is done by the scripts.

### 1. Node version

```bash
uberspace tools version use node 22
```

### 2. Domain

```bash
uberspace web domain add <domain>
uberspace web domain list        # shows the IP addresses to point DNS at
```

Create the DNS records for `<domain>` (A and AAAA, or a CNAME to the host name) at your DNS provider, then wait until `https://<domain>` answers.

### 3. API route

The API keeps its `/api` prefix, so the backend is registered for that path without stripping it:

```bash
uberspace web backend set <domain>/api --http --port 3000
uberspace web backend list
```

### 4. Database

```bash
mysql -e "CREATE DATABASE ${USER}_parsonxam CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

The MariaDB login is in `~/.my.cnf`. Tables are created by the migrations when the backend starts.

### 5. Mailbox

Sign-in links are sent from `<sender>` (set by `SMTP_FROM`; any address works as long as the SMTP login is allowed to send as it). If `<sender domain>` is not yet an Uberspace mail domain, add it and set the SPF/DKIM records Uberspace shows you.

```bash
uberspace mail domain add <sender domain>  # skip if it already exists
uberspace mail user add <local part of sender>   # e.g. noreply; asks for a password
```

### 6. Backend files and `.env`

```bash
mkdir -p ~/parsonxam-backend
nano ~/parsonxam-backend/.env
chmod 600 ~/parsonxam-backend/.env
```

```ini
PORT=3000
DATABASE_URL=mysql://<user>:<mysql password>@localhost:3306/<user>_parsonxam
PUBLIC_TEACHER_URL=https://<domain>
ALLOWED_ORIGINS=https://<owner>.github.io,https://<domain>
SMTP_HOST=<your Uberspace mail host name>
SMTP_PORT=587
SMTP_USER=<sender>
SMTP_PASS=<mailbox password>
SMTP_FROM=<sender>
```

`SMTP_HOST` is the host name of your Uberspace server (the same one you SSH into). Leaving it empty makes the backend print mails to its log instead of sending them, which is only for development.

### 7. Service

Create `~/etc/services.d/parsonxam-backend.ini`:

```ini
[program:parsonxam-backend]
directory=%(ENV_HOME)s/parsonxam-backend
command=node --env-file=.env dist/index.js
autostart=yes
autorestart=yes
startsecs=5
```

Do not start it yet: `dist/` does not exist until the first deploy. Register it with:

```bash
supervisorctl reread && supervisorctl update
```

`update` will try to start it and fail until the first backend deploy has run. That is expected; the deploy script restarts it.

### 8. GitHub Pages (student app)

In the GitHub repository:

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add `API_URL` = `https://<domain>/api`.

 The workflow `.github/workflows/deploy-student.yml` then builds `student/` with `BASE_PATH=/<repository>` and `VITE_API_URL` taken from the `API_URL` repository variable and publishes it on every push to `main` that touches `student/`. It can also be started by hand from the Actions tab.

## Deploying

From the repo root, on a machine that has SSH access:

```bash
./scripts/deploy-backend.sh      # lint + tests, tsc, rsync dist/, npm ci --omit=dev, restart service
./scripts/deploy-teacher.sh      # check + tests, vite build, rsync build/ into the domain's document root
```

Both scripts stop at the first failing check. The student app deploys itself on push.

Add the first teacher after the first backend deploy (accounts are created by hand, there is no sign-up):

```bash
ssh <user>@<host>
cd ~/parsonxam-backend
node --env-file=.env dist/scripts/add_teacher.js you@example.com "Your Name"
```

## Verifying a deployment

1. `curl https://<domain>/api/health` returns `{"status":"ok","db":"ok",...}`.
2. `https://<domain>` shows the teacher login; reloading a deep link such as `/classes` still works (that is the `.htaccess` rewrite).
3. Request a sign-in link for the teacher you added. The mail arrives from `<sender>` and the link opens the classes page.
4. Open `https://<owner>.github.io/<repository>/`, enter the code of a published exam: the join works (this proves CORS from GitHub Pages) and a deep link such as `/<repository>/exam` reloads instead of showing a GitHub 404.
5. Look at the service log if something fails: `supervisorctl status parsonxam-backend` and `tail ~/logs/supervisord.log`.

## Rolling back

The deploy scripts replace files in place. To go back, check out the previous commit and run the deploy script again. Database migrations only ever add (see `backend/src/db/migrations`), so an older backend keeps working against a newer schema.

## Troubleshooting

- **Browser shows a CORS error from the student app:** `ALLOWED_ORIGINS` on the server must contain `https://<owner>.github.io` exactly (no path, no trailing slash). Restart the service after editing `.env`.
- **All students are rate-limited together:** the backend reads the client IP from `X-Forwarded-For`, which Uberspace's proxy sets. If every request shows the same IP, the proxy headers are not arriving; check that the backend is registered with `uberspace web backend`, not reached on another port.
- **Mail does not arrive:** check spam, then `supervisorctl tail parsonxam-backend` for SMTP errors. The mailbox user and `SMTP_FROM` must be the same address.
