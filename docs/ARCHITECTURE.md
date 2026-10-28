# Architecture

## 1. Shape of the system

```
                    ┌──────────────────────────────────────────────┐
  Browser  ────────▶│  Next.js App Router (src/app)                │
  (server-rendered  │                                              │
   HTML + tiny      │  (marketing)  public pages                   │
   client islands)  │  auth/        sign-up, sign-in, reset        │
                    │  (app)/       authenticated shell            │
                    │  admin/       protected moderation area      │
                    │  api/         health, files, account export   │
                    └───────┬──────────────────────────┬───────────┘
                            │ server components (read) │ server actions (write)
                            ▼                          ▼
                    ┌──────────────────────────────────────────────┐
                    │  Service layer  (src/services/*)             │
                    │  users · projects · tasks · worklog ·        │
                    │  learning · stories · commerce · chat ·      │
                    │  social · profile · business · admin         │
                    └───────┬───────────────┬──────────────┬───────┘
                            │               │              │
                            ▼               ▼              ▼
                    ┌──────────────┐ ┌────────────┐ ┌────────────────────┐
                    │ Drizzle ORM  │ │ lib/authz  │ │ Provider adapters  │
                    │ db/schema.ts │ │ (access)   │ │ email · storage ·  │
                    │ db/client.ts │ │            │ │ AI/video · rate    │
                    └──────┬───────┘ └────────────┘ └─────────┬──────────┘
                           ▼                                  ▼
                    ┌──────────────┐                 ┌──────────────────┐
                    │ SQLite file  │                 │ private storage  │
                    │ (data/*.db)  │                 │ folder or S3     │
                    └──────────────┘                 └──────────────────┘
```

There is no separate API tier. The service layer **is** the API: it is the only code that touches the database, and it is callable from server components, server actions and the route handlers. That keeps a single authorisation surface instead of duplicated checks in REST controllers and pages.

## 2. Layering rules

| Layer | May do | Must not do |
| --- | --- | --- |
| `src/app/**/page.tsx` (server components) | Read via services, render HTML, redirect | Write to the database, trust search params as authority |
| `src/components/client/*` | Small interactive islands (nav, submit buttons, player, refresh) | Fetch privileged data, decode roles, decide permissions |
| `src/app/actions/*` | Parse `FormData`, call one service operation, revalidate, redirect with flash | Contain business rules or SQL |
| `src/services/*` | Validate input, authorise, transact, notify, audit | Render, redirect, read cookies directly |
| `src/lib/*` | Cross-cutting primitives: session, authz, storage, email, AI, reputation, rate limits, formatting | Import services (avoids cycles) |
| `db/*` | Schema, client, migrations, seed | Business rules |

`runServerAction` (`src/lib/actions.ts`) is the single mutation wrapper: it catches `AppError`, converts it into `?error=` text, refreshes the affected paths and redirects. Next.js control-flow errors are re-thrown untouched so redirects and `notFound()` still work.

## 3. Request flows

### Entry and return paths

```
GET /                        → session resolved on the server (never a client flag)
  ├─ no session              → (entry) Login / Sign Up screen, noindex
  └─ valid session           → redirect /home
GET /welcome                 → public marketing landing page (canonical /welcome)
GET /projects/p-river?tab=tasks   (signed out)
  → layout requireUser()     → redirect /auth/sign-in?next=%2Fprojects%2Fp-river%3Ftab%3Dtasks
  → signInAction             → safeNextPath() validates next → session cookie → redirect next
```

`src/lib/redirects.ts` is the only place that decides whether a post-login
return path is safe: same-origin absolute paths only, never `/`, `/welcome` or
the `/auth/*` screens, so a signed-in visitor cannot be sent back into a login
loop. The requested path and query are captured in middleware headers
(`x-pathname`, `x-search`); authentication itself is still enforced per page and
per action.

### Read: project page

```
GET /projects/p-river?tab=tasks
  → middleware adds x-pathname/x-search (nav highlighting and return paths; never auth)
  → layout resolves the session (src/lib/auth.ts)
  → page calls projectDetail(id, viewer), listTasks(id, viewer), projectJourneys(...)
  → projectDetail → getProjectAccess(id, viewer) → canView? → rows
  → server-rendered HTML (no client fetch, no token in the browser)
```

If `getProjectAccess` returns `null` or `canView === false`, the page calls `notFound()`. A private project never reveals whether it exists.

### Write: accept a contributor

```
Form POST → respondToInterestAction(formData)
  → runServerAction("/projects/x?tab=team", ...)
  → requireUserOrThrow()                        (session, suspension check)
  → respondToInterest(eoiId, viewer, "accepted")
       ├─ requireProjectAccess(projectId, viewer, "review")
       ├─ refuse self-acceptance
       └─ transaction: update EOI, upsert project member, assign task, set task status
  → notify(...) → notifications row
  → revalidatePath("/projects/x") → redirect with ?notice=...
```

### Write with media: story generation

```
generateStoryAction → generateStoryboard(projectId, viewer)
  ├─ requireProjectAccess(projectId, viewer, "story")   (owner only)
  ├─ rateLimit(`story:${userId}`, env.rateLimits.ai, 1h)
  ├─ collectSources(): public work-log entries, approved deliverables,
  │    completed milestones, public project updates — nothing team-only
  ├─ consentedUsers(): consent_records with granted=true and no revoked_at
  ├─ provider.generateStoryboard(...)  (local deterministic provider by default)
  └─ transaction: storyboards + story_scenes + generated_media(narration)
```

Rendering (`renderStoryboard`) writes a `generated_media` row with `processing`, produces the artefact, stores it privately, then flips to `ready` (or `failed` with an error message). Generation is **synchronous inside the request**; the status column and a "regenerate" affordance make the work observable. A dedicated queue is the documented next step (§8).

## 4. Authorisation matrix

`getProjectAccess` is the single decision point for project-scoped operations.

| Role | View | Edit project | Manage team | Review submissions | Private workspace | Stories |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reviewer | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Collaborator | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Observer | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Public viewer | public + published only | ❌ | ❌ | ❌ | ❌ | published only |
| Platform admin | normal rules | ❌ | ❌ | ❌ | ❌ | ❌ |

Platform administrators deliberately gain **no** access to private project content. They work from reports, public records and metadata, which is the minimum necessary for moderation.

Task access adds assignment checks: only the assignee can submit, only reviewers can decide, and nobody can review their own submission.

Entitlements are separate: `hasEntitlement(userId, resourceId)` returns true for the creator, for free resources, and for an unrevoked, unexpired entitlement row. Paid bodies are removed from the payload, not hidden.

## 5. Data access and transactions

- `getDb()` returns a singleton Drizzle client bound to `DATABASE_PATH` (SQLite, WAL).
- `transaction(cb)` wraps multi-step writes. It is used wherever a partial write would leave inconsistent state: project creation, interest acceptance, submission review, story generation approval, access grants/revocations, moderation, account deletion.
- Reads in server components are plain selects; expensive list views filter in SQL and cap results (pagination via `limit`/`offset` params on discovery pages).
- `json`, `number` and text columns stay SQL-portable. `json` is used for arrays of links, skills snapshots, edit history and consent metadata.

## 6. Runtime seams

| Concern | Interface | This build | Production path |
| --- | --- | --- | --- |
| Email | `EmailAdapter` in `src/lib/email.ts` | `console` writes to `data/outbox.log`, returns a preview URL | SMTP or API provider |
| Object storage | `StorageAdapter` in `src/lib/storage.ts` | `local` private directory, served by `/api/files/[fileId]` | S3-compatible bucket + signed URLs |
| Narration / storyboard | `StoryProvider` in `src/lib/ai.ts` | `local`: deterministic, source-cited | Hosted LLM behind the same interface |
| Video | `renderExplainer` part of `StoryProvider` | Animated SVG with CSS keyframes | Motion-graphics service returning MP4 |
| Rate limits | `rateLimit()` in `src/lib/rate-limit.ts` | In-memory fixed windows | Redis/Upstash with the same signature |
| Payments | `PAYMENTS_ENABLED` + entitlements service | Disabled; creator/admin grants | Marketplace-capable provider + webhooks |

Because the seams are typed, replacing one does not require touching pages, actions or the rest of the service layer.

## 7. Frontend architecture

- **Server components by default.** Data is resolved on the server; the browser receives HTML plus ~103 kB of shared JS.
- **Client islands only where interaction needs state**: `bottom-tabs` (five-destination bar, Create sheet, keyboard-aware hiding), `swipe-navigation` (touch gesture → the same router push, with View Transitions where supported), `profile-menu` (the one account menu, shown on the signed-in account's profile), `submit-button` (pending state), `story-player` (scene step-through, captions, reduced-motion aware), `auto-refresh` (chat/notification polling with a visibility check).
- **Design system** in `src/components/ui.tsx` plus `cards.tsx`, `media.tsx`, `comments.tsx`, `post-card.tsx`, `report-form.tsx`, `marketing.tsx`: buttons, fields, panels, tabs, badges, avatars, tables, empty/loading/error states, confirmation dialogs, progress meters, reputation indicators, media player, uploads.
- **Tokens** in `globals.css` (graphite/silver structure, coral and emerald accents, translucent glass surfaces) with CSS variables so the light and dark themes stay in sync without rewriting components.
- **Accessibility**: semantic landmarks, labelled form fields, visible focus rings, keyboard-operable menus and tabs, captions/transcripts for media, `prefers-reduced-motion` support, WCAG AA contrast targets, no autoplaying audio.

## 8. Known architectural limitations

1. SQLite on one node; concurrent writers queue rather than scale horizontally.
2. No job queue: AI generation and rendering block the request that triggered them.
3. In-memory rate limiting does not survive a restart and is per instance.
4. Chat uses polling (`auto-refresh`), not WebSockets; fine for this scale, not for high-frequency traffic.
5. No CDN image pipeline: uploaded images are served through the authorised file route at their stored size.
6. Analytics are computed from event and count tables on read; a large deployment should pre-aggregate nightly.
