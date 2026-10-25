# Setup, configuration and deployment

## 1. Local development

```bash
node --version                 # 18.18+ (20 LTS recommended)
npm install
cp .env.example .env.local     # optional locally; defaults are safe
npm run db:migrate
npm run db:seed
npm run dev
```

Then open <http://localhost:3000>. Sign in with `maya@example.test` / `BuildTogether2026!` (all demo accounts share that password).

Useful while developing:

- `/auth/dev-outbox` — the emails the console adapter wrote (development only).
- `npm test` — integration tests on a throwaway database; they never touch `data/buildtogether.db`.
- `npm run db:reset` — deletes the local database file; run migrate + seed afterwards.

## 2. Environment variables

Every variable has a safe default, so the app boots without any of them. Production requires at least `NEXT_PUBLIC_APP_URL` and `SESSION_SECRET`.

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical origin for links in emails and signed URLs. Public by design. |
| `DATABASE_PATH` | `./data/buildtogether.db` | SQLite file. Must be on a persistent volume. |
| `SESSION_SECRET` | placeholder | **Required in production.** 32+ random bytes, base64. The app refuses to run in production with the placeholder value. |
| `SESSION_TTL_DAYS` | `30` | Session lifetime. |
| `EMAIL_PROVIDER` | `console` | `console` writes to `data/outbox.log` and, in production, prints the action link to the server log (nothing is delivered — see §4). `smtp` currently throws until a transport is implemented. |
| `EMAIL_FROM` | `BuildTogether <no-reply@buildtogether.example>` | Sender identity. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | empty | Reserved for the SMTP adapter. |
| `STORAGE_DRIVER` | `local` | `local` (private folder) or `s3` (seam that returns 501 until implemented). |
| `STORAGE_LOCAL_DIR` | `./storage` | Private media directory. Must be on a persistent volume. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | empty | Reserved for the S3 adapter. |
| `AI_PROVIDER` | `local` | `local` = deterministic, source-cited storyboard generator. |
| `AI_API_KEY` / `AI_MODEL` | empty | Reserved for a hosted provider. |
| `VIDEO_PROVIDER` | `local` | `local` = animated SVG renderer. |
| `VIDEO_API_KEY` | empty | Reserved for a motion-graphics provider. |
| `PAYMENTS_ENABLED` | `false` | Leave false. No card data is collected in this build. |
| `DEMO_MODE` | unset | Demonstration deployment only. Seeds the fictional dataset once, on an empty database, and shows the demo sign-in details. Never set it on a deployment that people rely on. |
| `MAX_UPLOAD_MB` | `10` | Enforced before writing. |
| `ALLOWED_UPLOAD_TYPES` | png, jpeg, webp, gif, pdf, text, mp3, webm, mp4 | Comma-separated MIME allowlist; magic bytes are also checked. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10` | Per IP+email sign-in bucket. |
| `RATE_LIMIT_WRITE_PER_MINUTE` | `60` | General write bucket. |
| `RATE_LIMIT_AI_PER_HOUR` | `12` | Story generation per user. |

**Never** put real secrets in `.env.example`, in `NEXT_PUBLIC_*` variables, or in the repository. `.env*` files and `data/`/`storage/` are git-ignored.

## 3. Production build and run

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run db:migrate          # once per deploy, against the persistent volume
npm run db:seed:first-boot  # no-op unless DEMO_MODE=1 and the database has no accounts
npm start                  # next start, default port 3000
```

The build produces a standard Next.js server. It needs Node 18.18+, a writable persistent volume for `data/` (SQLite + outbox log) and `storage/` (media), and the environment variables above.

### Health check

```
GET /api/health   →  200 {"status":"ok","database":"ok", ...}
```

Point the platform's health check at this endpoint. It probes the database, reports the storage/email/AI provider modes and the payment flag, and returns a non-200 status when degraded.

It also names missing production configuration without revealing values, which is the fastest way to diagnose a broken deploy:

```json
{ "status": "degraded", "database": "ok", "schemaReady": true,
  "config": "incomplete", "configIssues": ["SESSION_SECRET is not set"] }
```

### Recommended hosting shape

Any platform that runs a long-lived Node process with a persistent disk works:

1. **Container** (Docker/Fly/Render/Railway/ECS) with the repo as build context, `data/` and `storage/` as mounted volumes, `/api/health` as the health check.
2. **Managed Node host** with a persistent disk and a single instance (SQLite requires one writer).
3. **Vercel + PostgreSQL** after completing the migration path in §5 — serverless filesystems cannot hold SQLite or the local media folder.

Do not run multiple instances against one SQLite file. If you need horizontal scaling, do §5 first and move media to object storage and rate limits to Redis.

### Deploy with Docker (works today)

The repository ships a `Dockerfile` that runs migrations on boot and keeps `data/` and
`storage/` on mounted volumes:

```bash
docker build -t buildtogether .
docker run -d -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e NEXT_PUBLIC_APP_URL="https://your.domain" \
  -v buildtogether-data:/app/data \
  -v buildtogether-media:/app/storage \
  buildtogether
```

**Platform notes.** Mount the volume at `/app/data` (SQLite plus the outbox log) and
`/app/storage` (uploads). Free tiers usually do **not** include a persistent disk; a small
instance with a 1 GB volume is the realistic minimum, and one instance only — SQLite must not
be shared by two processes.

- **Fly.io**: `fly launch --dockerfile Dockerfile`, then `fly volumes create data --size 1` and
  `fly volumes create media --size 1`; mount them at `/app/data` and `/app/storage` in
  `fly.toml`, and run a single machine.
- **Render**: the repository ships a blueprint (`render.yaml`) — Dashboard → **New → Blueprint**,
  pick the repo, then set `NEXT_PUBLIC_APP_URL` when prompted and redeploy so it is present at
  build time. The blueprint uses the Docker runtime, a 1 GB disk at `/app/data` holding both the
  database and uploads, and `/api/health` as the check. **A disk requires a paid instance
  (Starter and above); Render's free web services have an ephemeral filesystem**, so the free
  plan will start and then lose all data on the next deploy. Render snapshots the disk daily
  and keeps seven days of snapshots. Leave the service's **Docker Command** empty: Render
  passes it as a single argument to `sh -c`, so a pipeline containing `&&` exits 127 at boot
  and the deploy silently rolls back to the previous container. The image's exec-form `CMD`
  already runs migrations, first-boot seeding and `next start`.
- **Railway / VPS**: same container, bind-mount the two directories, terminate TLS in front.

Set `SESSION_SECRET` to 32+ random bytes and `NEXT_PUBLIC_APP_URL` to the public HTTPS origin;
`/api/health` reports `config: "incomplete"` until both are present.

A brand-new volume contains an empty database, so the site has no projects and nobody can sign
in. For a demonstration deployment, set `DEMO_MODE=1`: `npm run db:seed:first-boot` (wired into
the image's start command) then inserts the fictional dataset exactly once, the next boot sees
accounts and skips, and the sign-in page shows the demo credentials. A deployment without
`DEMO_MODE` keeps an honest empty state. Either way the seed refuses to wipe a database that
already holds an account, and `npm run db:seed` remains a development-only command.

If a demonstration site already holds a stray account and therefore skipped seeding, set
`DEMO_RESET=1` as well: the boot step then deletes the demo database and its uploads, reseeds,
and writes `.demo-reset-done` beside the database. It is one-shot — leaving the variable set
cannot erase data on a later restart — and it is the only path that destroys rows in
production, so remove it after the site shows the demo data.

> The image was **not** built in this repository's development environment (Docker is not
> installed there). The command sequence inside it — `npm ci`, `npm run build`,
> `npm run db:migrate`, `npm start` — is the same one verified locally in §3, and migrations
> were confirmed to apply to an empty database from a production build. Treat the first
> `docker build` as the remaining check.

### Serverless hosting (Netlify, Vercel Functions) is not supported

Deploying this build to Netlify fails at runtime with:

```
Application error: a server-side exception has occurred ... Digest: 1577178729
```

That is the expected result, not a bug in the page. A serverless function has a read-only
bundle filesystem, and this build stores its data in SQLite plus a local media folder:

- `db/client.ts` creates `data/buildtogether.db` on first use. `mkdir`/`open` fails with
  `EROFS`/`EACCES`, so every request that touches the database throws.
- Even with a writable directory, functions are ephemeral: the file would be discarded on the
  next cold start, silently deleting accounts, projects and sessions.
- Uploads in `storage/` have the same problem, and in-memory rate limits do not survive a
  cold start.

**Diagnosing any deployment:** open `/api/health`. It now returns a reason code instead of a
digest:

```json
{ "status": "degraded", "database": "error", "databaseReason": "read_only_filesystem", "schemaReady": null }
```

| `databaseReason` | Meaning | Fix |
| --- | --- | --- |
| `read_only_filesystem` | The process cannot create or write the database file | Run on a host with a persistent volume, or complete §5 |
| `native_module_missing` | `better-sqlite3` was not packaged into the build | Deploy from a container or full Node host, not a bundle-only platform |
| `cannot_open` | The path exists but is not a usable database | Check `DATABASE_PATH` and file permissions |
| `schema_missing` | Connected, but migrations were never applied | Run `npm run db:migrate` against that database |
| `query_failed` | The database answers but the query failed | Read the server logs |

Application errors now render a diagnostic page that names the reason and links to
`/api/health` (`src/app/error.tsx`, `src/app/global-error.tsx`) rather than the framework's
generic digest screen.

To host this build today, use option 1 or 2 above. To host it on Netlify or Vercel, §5 must be
completed first — there is no configuration flag that makes SQLite persistent on serverless.

## 4. First-run checklist

1. Set `NEXT_PUBLIC_APP_URL` and a real `SESSION_SECRET`.
2. Run migrations against the production database.
3. Decide whether to seed: `npm run db:seed` is **destructive** (it wipes application tables) and is intended for demos. Never run it against real data.
4. Create the first administrator through the normal sign-up flow, then grant the role in the database:
   ```sql
   UPDATE users SET is_admin = 1, is_moderator = 1 WHERE email = 'you@example.com';
   ```
   There is no self-service admin escalation by design.
5. Verify `/api/health`, sign-up, email verification (inspect `data/outbox.log` until SMTP is configured), creating a project, and an admin sign-in to `/admin`.
6. Terminate TLS at the proxy or platform. The app already sends `Strict-Transport-Security`
   and a `Content-Security-Policy` in production builds (see `next.config.ts`); HSTS is sent
   only when `NODE_ENV=production`, so a local http:// server is never pinned.

## 5. Moving to PostgreSQL

The schema and queries are written to be portable:

1. Replace `better-sqlite3` with `postgres`/`pg` and switch `db/client.ts` to `drizzle-orm/node-postgres`. Keep the `getDb()` and `transaction()` signatures so no service changes.
2. Change `db/schema.ts` imports from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core`. Map types: `text` stays, `integer({ mode: "boolean" })` → `boolean`, `integer` → `integer`, JSON columns → `jsonb`, timestamps stay ISO strings (or switch to `timestamptz` and update the formatters in `src/lib/format.ts`).
3. Regenerate migrations with `npm run db:generate` against a PostgreSQL dialect config and apply with `drizzle-kit migrate`.
4. Migrate data: dump each table from SQLite and load it in dependency order (users → businesses → projects → tasks → …), or use a small script with the same service-independent column mapping.
5. Move media from `storage/` to an S3-compatible bucket and implement the `s3` branch of `src/lib/storage.ts`.
6. Move rate limits to Redis/Upstash.
7. Re-run `npm test` — the suites are database-agnostic and will catch dialect mistakes.

## 6. Backups and recovery

**SQLite (current build)**

```bash
# consistent online backup, safe while the app is running
sqlite3 data/buildtogether.db ".backup 'backup/buildtogether-$(date +%F).db'"
```

Also back up the `storage/` directory; a database without its media is a broken restore. Keep at least daily backups off-host, encrypt them, and **test a restore** into a scratch volume before relying on the process.

**Recovery runbook**

1. Stop the app.
2. Restore the newest verified database file and the matching `storage/` snapshot to the persistent volume, preserving permissions.
3. Run `npm run db:migrate` (no-op if the backup is current).
4. Start the app and check `/api/health`.
5. Spot-check sign-in, one project page and one media file.
6. Note the recovery time and data loss window; investigate before reopening writes.

**PostgreSQL**: use the provider's point-in-time recovery, plus object-storage versioning for media.

## 7. Operating notes

- **Sessions**: expired rows are only purged when `purgeExpiredSessions()` is called. Schedule it (or a SQL `DELETE FROM sessions WHERE expires_at < now`) daily.
- **Media**: failed generations leave `generated_media` rows with `status='failed'` and an error message; they are retryable from the story page. Orphaned files are not yet cleaned up; add a job once in production.
- **Reports**: the moderation queue is the operational surface; `platformMetrics()` powers the admin overview. Watch the backlog.
- **Logs**: the app logs action failures and startup only. Add structured logging (request id, user id, action) before real traffic.
- **Scaling**: read the limitations in `docs/ROADMAP.md` before adding instances.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `SQLITE_CANTOPEN` | `data/` missing or not writable | Create the directory and grant the process write access |
| Sign-in succeeds but every page redirects to `/auth/sign-in` | Clock skew or `SESSION_SECRET` changed | Use NTP; changing the secret invalidates every existing session (expected) |
| Verification links do not arrive | Console email adapter | Read `data/outbox.log` or configure a real email provider |
| Uploads rejected with 415 | MIME not in `ALLOWED_UPLOAD_TYPES`, or magic bytes disagree | Add the type deliberately; do not disable sniffing |
| `Object storage is not configured` | `STORAGE_DRIVER=s3` without an adapter | Use `local` or implement the S3 branch |
| Story generation says "not enough approved documentation" | No public, consented material | Approve work-log entries/milestones or publish a project update |
| Admin pages redirect to `/home` | Account lacks `is_admin`/`is_moderator` | Grant the role in the database and sign in again |
| `no such table` | Migrations not applied to that database file | `npm run db:migrate` with the same `DATABASE_PATH` |
