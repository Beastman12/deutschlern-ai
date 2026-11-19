# Deployment guide — DeutschLern AI (Milestone 9)

This app is a single Node/Express process serving a vanilla HTML/CSS/ES-module
frontend and a self-hosted atomic JSON store. There is **no build step** and no
external database, so a production deploy is deliberately small. Milestone 9
adds rate limiting, readiness probing, container artifacts and a backup script.

## 1. Requirements

- **Node.js 20+** (the container image pins `node:20-alpine`).
- A writable persistent directory for `DATA_DIR`.
- A strong `SESSION_SECRET` of at least 32 characters in production. The server
  **fails closed** without one: accounts stay unavailable and
  `/api/health/ready` returns `503`.
- Optional provider keys (`OPENAI_API_KEY`, `AZURE_SPEECH_KEY`) are only read
  server-side. Leaving them unset yields honest `not configured` statuses; no
  AI or transcription output is ever fabricated.

## 2. Configuration

All configuration comes from process environment variables. `.env.example`
documents every supported key; Node does **not** auto-load `.env`, so export
them in your shell, systemd unit or compose file. Never place secrets in
frontend code or in any endpoint response.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables HSTS and fail-closed auth. |
| `PORT` | `3000` | Listening port. |
| `TRUST_PROXY` | `false` | Reverse proxy setups only: `true`/`1` for one hop, an integer for N hops, or a comma-separated proxy IP list. Leave unset when Node is exposed directly; forwarded headers are then ignored and rate limits key on the socket peer. |
| `DATA_DIR` | `./data` | Directory for the JSON database and (dev only) session secret. |
| `SESSION_SECRET` | (dev secret auto-created) | **Required in production.** |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | empty | Optional server-side AI provider. |
| `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | — | Optional OpenAI-compatible provider. |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | empty | Optional transcription fallback. |
| `RATE_AI_WINDOW_MS` / `RATE_AI_MAX` | `60000` / `20` | AI chat limiter. |
| `RATE_SPEECH_WINDOW_MS` / `RATE_SPEECH_MAX` | `60000` / `12` | Transcription limiter. |
| `RATE_AUTH_WINDOW_MS` | `900000` | Shared auth window. |
| `RATE_REGISTER_MAX` / `RATE_LOGIN_MAX` | `20` / `30` | Registration / login caps. |
| `RATE_PASSWORD_MAX` / `RATE_ACCOUNT_DELETE_MAX` | `10` / `5` | Reset and deletion caps. |
| `RATE_SYNC_WINDOW_MS` / `RATE_SYNC_WRITE_MAX` | `60000` / `60` | Progress sync write caps. |
| `ALLOW_DEV_RESET_TOKENS` | false | Dev-only reset token echo; **never enable in production**. |

Malformed `RATE_*` values are ignored in favour of safe defaults. Rate-limit
responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
and `Retry-After` headers.

## 3. Run locally

```bash
npm ci
npm start
# http://localhost:3000
```

Development mode auto-creates a 43-byte random secret in `DATA_DIR`; that's why
readiness returns `200` locally. In production you must supply a secret of at
least 32 characters yourself; shorter values are rejected without ever being
echoed in a response or log.

## 4. Production with Node directly

```bash
npm ci --omit=dev
export NODE_ENV=production
export PORT=3000
export DATA_DIR=/srv/deutschlern/data
export SESSION_SECRET="$(openssl rand -base64 48)"
node server/index.js
```

A minimal systemd unit (`/etc/systemd/system/deutschlern.service`):

```ini
[Unit]
Description=DeutschLern AI
After=network.target

[Service]
Type=simple
User=deutschlern
WorkingDirectory=/srv/deutschlern/app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATA_DIR=/srv/deutschlern/data
EnvironmentFile=/etc/deutschlern.env
ExecStart=/usr/bin/node server/index.js
Restart=unless-stopped
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/deutschlern/data

[Install]
WantedBy=multi-user.target
```

Keep `/etc/deutschlern.env` mode `0600`. Put a reverse proxy (nginx, Caddy,
etc.) in front for TLS; the app sets HSTS in production. Express trusts no
proxy by default (`TRUST_PROXY=false`), so `X-Forwarded-For` from an untrusted
client cannot influence rate limits. Only when Node sits behind a known proxy
should you set `TRUST_PROXY` to the hop count or trusted proxy IP list. Rate
limiters always key on the socket peer address regardless of this setting.

## 5. Docker / Compose

```bash
cp .env.example .env
# edit .env: set SESSION_SECRET (required), optional provider keys
docker compose up -d --build
docker compose logs -f app
```

Compose refuses to start if `SESSION_SECRET` is unset, matching the server's
fail-closed readiness contract. Persistent state lives in the `data` named
volume mounted at `/app/data`. To rebuild after a code change:

```bash
docker compose up -d --build
```

The image runs as the unprivileged `node` user and only contains runtime files
and production dependencies.

## 6. Health and readiness

- `GET /api/health` — **liveness**. Always `200` while the process is up;
  reports `version`, `milestone`, auth configuration booleans and uptime. Never
  contains secrets.
- `GET /api/health/ready` — **readiness**. `200` only when storage initialized
  and accounts are configured; `503` with `status: not_ready` otherwise. Point
  orchestrator readiness probes here so a misconfigured deploy receives no
  traffic.

The container healthcheck uses liveness; the compose healthcheck uses readiness.

## 7. Backup and restore

Accounts, sessions and synced progress are all in `DATA_DIR/deutschlern-db.json`.
In development `DATA_DIR/dev-session-secret` is also present and **must be kept**
to preserve existing sessions.

Create a snapshot (timestamped, `0600`, rotated to the newest 7 by default):

```bash
npm run backup
# or, with explicit paths and retention:
DATA_DIR=/srv/deutschlern/data BACKUP_DIR=/srv/deutschlern/backups \
  BACKUP_RETAIN=14 node scripts/backup.mjs
```

Each snapshot contains the copied files plus a `manifest.json` with counts and
sizes (never secret contents). Restore by stopping the server, copying the
snapshot files back into `DATA_DIR`, then starting the server again:

```bash
systemctl stop deutschlern
cp /srv/deutschlern/backups/backup-<timestamp>/deutschlern-db.json /srv/deutschlern/data/
cp /srv/deutschlern/backups/backup-<timestamp>/dev-session-secret /srv/deutschlern/data/  # dev only
systemctl start deutschlern
```

Backups should be copied off-host; a local rotation is not disaster recovery.
Because the database is written atomically (temp file + rename), copying the
file while the server is stopped avoids partial reads.

## 8. Security posture

- Helmet-style headers on every response: CSP (`default-src 'self'`, no inline
  scripts, `object-src 'none'`, `frame-ancestors 'none'`), `nosniff`, `DENY`
  framing, referrer and permissions policies, plus HSTS in production.
- Bounded sliding-window rate limits keyed on the socket peer address on AI,
  speech, registration, login, password request/reset, account deletion and sync
  writes, so forwarded headers cannot rotate buckets. The key map is hard capped
  against spoofed-IP floods and standard rate-limit headers are returned.
- JSON bodies are parsed per route with a 64 kb cap for auth, 1 mb for sync and
  3 mb for AI/speech; oversized bodies get a JSON `413`. No global parser can
  consume a request before its smaller route cap applies.
- Static serving denies dotfiles and cannot escape its root; unknown API routes
  return JSON `404` and never the SPA shell.
- Sessions are opaque server records with signed cookies (`HttpOnly`, `SameSite`,
  `Secure` in production), password hashing uses unique salts and constant-time
  verification, and unconfigured providers fail closed with no invented output.

## 9. Monitoring and logs

- The server logs startup version/milestone and unhandled 5xx errors to stdout.
  Ship container/systemd stdout to your log aggregator.
- Watch `/api/health/ready` for readiness and `/api/health` for liveness.
- Log 429 response counts per route to detect abuse; rate counters are
  process-local and reset on restart.

## 10. Limitations

- **Single instance by design.** Rate-limit counters are in memory, so multiple
  replicas would each keep independent budgets. Run one replica, or move the
  limiter to a shared store before scaling out.
- The JSON store serializes writes through one queue. It is suitable for a
  self-hosted deployment but not for high write concurrency; a PostgreSQL
  adapter can replace `server/db.js` without changing router contracts.
- Writing practice feedback is deterministic and labelled as such — it is not
  an AI grammar score.

## 11. Verify a deployment

```bash
npm test                       # full unit/integration test suite
npm run test:coverage          # same suite with a coverage report
npm run verify                 # end-to-end HTTP/UI checks
npm run test:ui                # browser UI audit
npm run test:a11y              # accessibility audit
npm run validate:lesson content/lessons
npm audit --audit-level=high
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/health/ready
```

## 12. Render deployment

`render.yaml` defines a single free Node web service. Render's free plan has no
persistent disk, so `DATA_DIR` is an ephemeral `/tmp/deutschlern-data` directory:
the app runs normally, but accounts and synced progress reset on restart or
redeploy. Use the paid Blueprint with a 1 GB disk if persistence is required.

Create the service from the Blueprint, then set `AI_API_KEY` when prompted. The
Blueprint generates `SESSION_SECRET`, sets `NODE_ENV=production`,
`DATA_DIR=/tmp/deutschlern-data`, `TRUST_PROXY=1` for Render's single proxy hop,
and configures the current OpenAI-compatible Gemini endpoint. The public URL will be
`https://<service-name>.onrender.com`. Verify it with:

```bash
curl -fsS https://<service-name>.onrender.com/api/health
curl -fsS https://<service-name>.onrender.com/api/health/ready
curl -fsS https://<service-name>.onrender.com/api/ai/status
```

`/api/health/ready` must return `200`; `/api/ai/status` must report
`configured: true` without exposing the key. Browser speech recognition works
without additional credentials; optional Azure transcription can be added later
with `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.

