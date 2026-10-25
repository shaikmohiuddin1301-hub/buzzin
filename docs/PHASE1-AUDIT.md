# Phase 1 — Repository audit and implementation plan

Audit date: 2026-10-25. Repository: `SkillsSharingApp` (BuildTogether). No git history is
present, so the checkpoint below is the rollback point for this work.

**Checkpoint:** `checkpoints/pre-backend-hardening-2026-10-25.tar.gz` (source only; excludes
`node_modules`, `.next`, `data`, `storage`).

**Baseline, measured before any change**

| Check | Command | Result |
| --- | --- | --- |
| Integration tests | `npm test` | 66 passed / 6 files (20.9s) |
| Types | `npx tsc --noEmit` | clean |
| Production build | `npm run build` | succeeds |
| Seed | `npm run db:seed` | succeeds (7 people, 5 projects, 6 tasks, 4 resources, 2 stories) |

This audit exists to answer one question honestly: **how much of the requested backend is
already real?** The answer is: most of the data model, authentication and authorisation is
implemented and tested, but it runs on SQLite, and four production integrations are adapters
that deliberately fail closed (email, object storage, distributed rate limiting, hosted AI).
Those are the gaps this plan addresses.

---

## 1. Actual stack

| Layer | Technology | Version |
| --- | --- | --- |
| Framework | Next.js App Router (server components + server actions) | 15.5.x |
| UI | React 19, Tailwind CSS 3.4, lucide-react | 19.1.0 / 3.4.17 |
| Language | TypeScript, strict-ish `tsconfig` | 5.7.3 |
| ORM | Drizzle ORM (`sqlite-core`) | 0.44.6 |
| Database | SQLite (better-sqlite3), WAL, `foreign_keys = ON` | 11.10.0 |
| Validation | Hand-written per-service checks; **Zod is installed but unused** | zod 3.25.76 |
| Auth | Custom: scrypt hashes, DB-backed sessions, hashed single-use tokens | — |
| Tests | Vitest, per-file throwaway SQLite databases | 2.1.9 |
| Package manager | npm (`package-lock.json`) | — |

There is **no separate API layer**: mutations are Next.js server actions, and three route
handlers exist (`/api/health`, `/api/files/[fileId]`, `/api/account/export`). There are no
`fetch()` calls in application code, so there is no mock HTTP layer to unwire.

## 2. What is real, and what is an adapter or intentionally disabled

| Capability | State | Evidence |
| --- | --- | --- |
| Persistent relational data | **Real.** 63 tables, FK constraints, unique and filtered indexes | `db/schema.ts` |
| Migrations | **Real.** Forward-only runner, one transaction per file, `_migrations` ledger | `db/migrate.ts`, `db/migrations/0000_init.sql` (966 lines) |
| Auth | **Real.** scrypt (N=16384), 10-char policy, DB sessions with SHA-256 token at rest, httpOnly/SameSite=Lax cookies, revocation, verify + reset tokens, suspended accounts rejected | `src/lib/password.ts`, `src/lib/session.ts`, `src/services/users.ts` |
| Authorisation | **Real and centralised.** `Viewer` helpers + per-service checks; UI never supplies trusted roles | `src/lib/authz.ts`, every `src/services/*.ts` |
| Audit trail | **Real, append-only by convention.** Admin-only read; no DB-level UPDATE/DELETE protection | `src/lib/notify.ts:43`, `src/services/admin.ts:311` |
| Notifications | **Real.** In-app rows, preference matrix, no private body text in previews | `src/lib/notify.ts` |
| Moderation / reports | **Real.** Report → admin triage → moderation action + audit row, reason codes required | `src/services/admin.ts` |
| Private media | **Real.** Private by default, magic-byte sniffing, size/type allowlist, signed time-limited URLs | `src/lib/storage.ts` |
| Rate limiting | **In-memory only** — per-process, lost on restart, wrong behind >1 instance | `src/lib/rate-limit.ts` |
| Email | **Console adapter only** — writes `data/outbox.log`; `smtp` throws by design | `src/lib/email.ts` |
| Object storage | **Local folder only** — `s3` adapter throws 501 | `src/lib/storage.ts` |
| Story generation | **Real but local** — deterministic, source-citing generator; no hosted LLM | `src/lib/ai.ts` |
| Video export | **Real but local** — animated SVG/CSS explainer, not hosted video rendering | `src/services/stories.ts` |
| Payments | **Intentionally disabled in code** (`return false && …`), entitlement-only access | `src/lib/env.ts` |
| Demo data | **Real seed script, production-unsafe**: it deletes every row and inserts fixtures, with no `NODE_ENV` guard | `db/seed.ts:88` |

## 3. Requirement matrix

Legend: **Met** = implemented and tested; **Partial** = implemented with a documented limit;
**Gap** = not implemented.

### Phase 2 — data model

| Requirement | Status | Notes |
| --- | --- | --- |
| Profiles with visibility and sharing preferences | Met | `users`, `user_preferences`; credentials live in the same server-only table, never selected into public projections |
| Projects: slug, category, tags, skills, media, visibility, arrangement, goals, milestones, soft state | Partial | All present except explicit lifecycle values **seeking contributors / seeking licence / for sale**; `status` is draft/published/archived plus a separate `stage`, and licensing is free text in `ipNotes` |
| Memberships and invitations, no duplicate active membership | Met | `project_members` UNIQUE(project_id, user_id); `project_invitations` |
| Contribution requests and agreements (descriptive only) | Met | `expressions_of_interest` (with `scopeConfirmedAt` on assignments), `task_assignments`, `task_reviews` |
| Contribution submissions + owner acceptance + review history | Met | `task_submissions`, `task_reviews`, `deliverables`; self-approval blocked and tested |
| Project documentation: notes, decisions, updates, milestones, evidence | Met | `work_log_entries` (visibility/approval), `project_updates`, `project_milestones` |
| Project follows / user follows, unique | Met | `project_follows`, `follows` — both unique-indexed |
| Stories, sources, approval, permissions | Met | `storyboards`, `story_scenes`, `media_approvals`, `consent_records`; consent withdrawal revokes scope and is tested |
| Portfolio entries from accepted contributions only | Met | `contributor_attributions` + `profile.ts`; public flag respected |
| Notifications | Met | `notifications`, preference-aware, no private text |
| Audit events, append-only, no secrets | Partial | Append-only *by convention*; nothing at DB level stops UPDATE/DELETE |
| Reports and moderation | Met | `reports`, `moderation_actions`, `disputes` |
| Indexes, FKs, uniqueness | Met | Indexes on status/owner/created/membership/notification paths |
| Pagination | Partial | Project feed paginates (`limit`/`offset`, capped 24); social feeds use fixed caps, no cursor |
| Version-controlled migrations, no dashboard-only schema | Met | Single SQL migration + Drizzle meta snapshot |
| **PostgreSQL** | **Gap** | SQLite only; schema is portable text/integer but the driver is `better-sqlite3` |

### Phase 3 — authentication and authorisation

| Requirement | Status | Notes |
| --- | --- | --- |
| Sign up / in / out, verification, recovery, sessions, protected routes | Met | Verification and reset tokens are single-use, hashed, time-boxed; tests cover reuse and session revocation |
| Anonymous read of published public content only | Met | Public pages filter on `status`/`visibility`; private records 404 |
| Owner / collaborator / contributor / reviewer scoping | Met | `assertProjectRole`, task-level checks, `assertConversationMember` |
| Only owners/reviewers accept contributions; no self-approval | Met | Tested in `tests/tasks.test.ts`, `tests/journeys-and-stories.test.ts` |
| Users control own profile and sharing | Met | `updatePreferences`, consent records |
| No cross-user modification | Met | Service-layer ownership checks; tested negatives |
| Restricted admin/moderator permissions | Met | `requireAdminOrThrow`, reason codes required, audit row per action |
| Never trust client-supplied role/owner/status | Met | Actions re-load rows; only whitelisted form fields are read |

### Phase 4 — database security

| Requirement | Status | Notes |
| --- | --- | --- |
| RLS on every client-exposed table | Gap (N/A today) | No client-side DB access exists; all reads/writes go through the server. RLS becomes relevant only if Supabase client access is introduced |
| Storage bucket policies, upload limits, type validation | Partial | Equivalent enforced in code (allowlist, size, magic bytes, private default, signed URLs); local disk only |
| Service-role / DB credentials server-only | Met | No privileged key is exposed; `NEXT_PUBLIC_*` is limited to `NEXT_PUBLIC_APP_URL` |
| Abuse limits | Partial | In-memory only |
| HTTPS review | Partial | Cookie `secure` in production; no HSTS header; deployment-terminated TLS not yet configured |
| Positive and negative policy tests | Partial | 66 service-level tests incl. negatives; no HTTP-level route tests |

### Phase 5 — real application integration

All listed UI flows are already database-backed: feed, search/filter, create/edit project,
status change, follow, apply, review request, record scope, submit and review deliverables,
documentation, story approval/publish, portfolio, notifications, reporting. No mock data
module exists. Empty states and loading states are present in the app shell.

### Phase 6 — API and validation

| Requirement | Status | Notes |
| --- | --- | --- |
| Server-side validation of every input | Partial | Hand-written and consistent, but **not** a shared schema layer; Zod is unused despite the comment in `src/lib/types.ts` |
| Consistent error envelope, no secret leakage | Met | `AppError` family → typed results |
| Pagination and maximum page size | Partial | Feed capped at 24; social lists fixed at 60/240 |
| Rate limiting | Partial | Present on auth, writes, AI; in-memory |
| Security headers | Partial | nosniff, frame-deny, referrer, permissions, COOP set; **no CSP, no HSTS** |
| CORS | Met (by omission) | Same-origin only; no wildcard CORS |
| Idempotency / duplicate protection | Partial | Unique indexes prevent duplicate follows/EOIs/reputation; no request-idempotency keys |

### Phase 7 — demo data and environments

| Requirement | Status | Notes |
| --- | --- | --- |
| Labelled demo fixtures + repeatable seed | Met | Seed prints a fictional-data notice |
| Production safety | **Gap** | `db:seed` will wipe and reseed a production database if run there |
| Dev/staging/prod separation | Partial | Env-var driven only; no staging config or `.env.production` template |
| No silent fallback to mock data | Met | There is no mock path; a DB failure surfaces an error and `/api/health` reports `degraded` |

### Phase 8 — testing

66 tests across auth, projects, tasks, learning/commerce, journeys/stories, social/moderation.
Covered: anonymous denial, cross-user denial, self-approval denial, invalid transitions,
consent withdrawal, moderation gating, upload rejection (declared-type mismatch). **Not
covered:** HTTP route handlers, migration-from-clean assertions, DB-level append-only audit,
browser flows.

### Phase 9 — deployment

Documented in `docs/DEPLOYMENT.md` and `docs/SECURITY.md`. **Not present:** Dockerfile,
compose file, CI workflow, error tracking, backup configuration, rollback scripts, staging
environment. Backups and monitoring are described, not configured — they must not be claimed
as done.

---

## 4. Gaps that matter, ranked

| # | Gap | Risk | Effort |
| --- | --- | --- | --- |
| G1 | SQLite, not PostgreSQL | Blocks multi-instance/serverless hosting and the brief's Postgres requirement | **Large** — 577 sync Drizzle call sites must become async; all services and their callers change |
| G2 | Seed can wipe production | Data loss (irreversible) | Small |
| G3 | No real email transport | No verification or recovery in production | Small once a provider is chosen |
| G4 | No real object storage | Uploads lost on redeploy without a persistent volume | Medium |
| G5 | In-memory rate limits | Brute-force protection broken across instances | Medium (needs Redis/Upstash if >1 instance) |
| G6 | Missing CSP/HSTS | Weaker XSS/transport posture | Small (CSP needs nonce or hash for inline styles) |
| G7 | Zod unused, hand-rolled validation | Drift as endpoints grow | Medium (mechanical) |
| G8 | Audit trail not enforced append-only at the DB | Tampering by DB-level access | Small (trigger/revoke grants) |
| G9 | No HTTP-level or migration tests | Route-level regressions escape | Medium |
| G10 | No deploy artifacts/CI/monitoring | Operational guesswork | Medium |

## 5. The decision that determines everything else

The brief says to extend an existing suitable backend rather than migrate needlessly. The
existing backend **is** suitable in design, but it is on SQLite. Moving to PostgreSQL is not a
driver swap here: the service layer uses Drizzle's synchronous SQLite API, so every service
function and every caller becomes asynchronous.

| Option | What it means | Cost | What you get |
| --- | --- | --- | --- |
| **A. PostgreSQL, keep custom auth** (recommended) | Drizzle `pg-core` + `node-postgres`, schema translated to `timestamptz`/`jsonb`/native enums, services made async, tests re-run; managed Postgres such as Neon | Largest code change, no auth rewrite | Real Postgres, multi-instance capable, provider-portable, keeps every auth/authz behaviour and test |
| **B. Supabase (Postgres + Auth + Storage + RLS)** | Same Postgres work **plus** replacing the custom session/scrypt layer with Supabase Auth and adding RLS policies on 63 tables | Largest overall | Managed auth/storage, brief's default architecture, RLS as defence-in-depth |
| **C. Keep SQLite, harden for single node** | Keep the driver; add guard rails, CSP, email/storage adapters, deployment docs; deploy on a persistent volume | Smallest | Working production app on one instance; no RLS, no horizontal scaling, no serverless |

Recommendation: **A**, with Supabase/Neon only as the *hosted Postgres provider*, because the
authorisation rules already exist in code and are tested; re-implementing them as RLS policies
adds a second source of truth for the same rules without removing the first.

## 6. Proposed sequence (one phase per pass, tests green at every step)

1. **Safety + hardening (no architecture change):** production guard on the seed, CSP/HSTS,
   append-only audit enforcement, Zod schemas at the action boundary, request-idempotency for
   contribution submits.
2. **PostgreSQL migration** (option A) behind the existing test suite: schema translation,
   migration regeneration, async service layer, Docker Compose for local Postgres, Neon for
   managed.
3. **Real adapters:** email transport, S3-compatible storage, shared rate-limit store — each
   behind the existing interface, failing closed when unconfigured.
4. **Tests:** HTTP-level authorisation tests, migration-from-clean tests, DB constraint tests.
5. **Deployment:** Dockerfile, CI workflow, staging config, backups, monitoring, rollback and
   incident runbook; then the final acceptance report with real results and residual risks.

## 7. Needs from you

1. Choose the database direction (A, B or C above).
2. Name the hosting target (Vercel, Fly.io/Railway with a persistent volume, or a VPS you
   control), because it constrains storage and rate limiting.
3. Provide accounts/keys for the services you want wired in this pass: Postgres connection
   string, email provider, S3-compatible bucket, and (if multi-instance) Redis/Upstash.
   Nothing is invented here; unconfigured adapters keep failing closed with a clear error.
