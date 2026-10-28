# BuildTogether

BuildTogether is a working full-stack platform where people discover projects, collaborate on real work, document how the work happened, turn that record into learning material, build evidence-based reputation and (in test mode) sell educational content.

The whole product is organised around one loop:

> Build something → document the work → turn the journey into learning → build reputation and an audience → unlock the next project and income opportunity.

Everything in this repository is a real, database-backed application: there is no mock data layer, no fake button that only shows a toast, and no screen that exists only as a picture.

---

## 1. What actually works in this build

| Area | Status |
| --- | --- |
| Email/password auth, verification, reset, sessions, account deletion, data export | Working |
| Onboarding, profiles, skills, follows, blocks, privacy settings | Working |
| Project creation wizard, drafts, publishing, visibility rules | Working |
| Explore + global search (projects, people, skills, learning, businesses) | Working |
| Tasks, expressions of interest, invitations, assignment, scope confirmation | Working |
| Contributor workspace (documentation with per-entry visibility and consent) | Working |
| Submissions, review/revision, owner-confirmed contribution records | Working |
| Learning journeys (drafted from approved documentation, owner approval gate) | Working |
| AI storyboard generation, scene editing, review, animated SVG explainer | Working with the local deterministic provider (see §7) |
| Learning library, free and premium resources, entitlement checks on the server | Working |
| Creator studio, products, sales view, access grants and revocations | Working |
| Chat (direct + private project groups), notifications, unread counts | Working |
| Business accounts, team roles, business portfolio and analytics | Working |
| Admin/moderation: reports, actions with reason codes, disputes, audit log | Working |
| Payments | **Deliberately not enabled** (see §7) |
| OAuth sign-in, MFA, SMTP delivery, S3 storage, hosted AI/video, Redis rate limits | **Seams only** (see `docs/ROADMAP.md`) |

---

## 2. Stack

- **Next.js 15 (App Router) + React 19 + TypeScript** — server components for reads, server actions for writes.
- **Tailwind CSS 3** with a small in-repo design system (`src/components/ui.tsx`, `src/app/globals.css`).
- **Drizzle ORM + better-sqlite3** — SQLite for this build; schema and queries are written to be portable to PostgreSQL (see `docs/DEPLOYMENT.md`).
- **Zod** for request validation where input arrives outside a form type.
- **Vitest** for integration tests against the real service layer and a throwaway SQLite database.
- No client state library: server-rendered data plus progressive enhancement.

---

## 3. Quick start

Requirements: Node.js ≥ 18.18 (20 LTS recommended), npm.

```bash
npm install
cp .env.example .env.local      # placeholders only, no real secrets required
npm run db:migrate              # create the SQLite schema
npm run db:seed                 # fictional demo data (wipes app tables first)
npm run dev                     # http://localhost:3000
```

`.env.local` is optional for local development: every value in `.env.example` has a safe default. `SESSION_SECRET` must be set to a real random value before any deployment.

### Demo accounts (fictional)

Every seeded account uses the password `BuildTogether2026!`.

| Email | Username | Role in the demo |
| --- | --- | --- |
| `maya@example.test` | `maya_okafor` | Project creator, educator, paid-course author |
| `jonas@example.test` | `jonas_b` | Contributor with confirmed work history |
| `amara@example.test` | `amara_d` | Contributor / learner |
| `leo@example.test` | `leo_chen` | Contributor with work samples |
| `priya@example.test` | `priya_n` | Learner and educator |
| `sam@example.test` | `sam_admin` | Administrator |
| `ruth@example.test` | `ruth_mod` | Moderator |

Seeded projects include *River Watch*, *Quiet Routes*, *Open Pantry*, *Mend Studio* and *Neighbourhood Air Map*; seeded learning material includes one paid course with a free preview, one story, one journey and one article.

### Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm start           # serve the production build
npm run typecheck   # tsc --noEmit (ESLint is not configured in this build)
npm test            # vitest run (251 integration tests)
npm run test:e2e    # Playwright browser suite (own seeded database on :3100)
npm run db:generate # regenerate SQL migrations from db/schema.ts (drizzle-kit)
npm run db:migrate  # apply pending migrations
npm run db:seed     # fictional demo data
npm run db:reset    # delete the local database file (development only)
```

---

## 4. Routes

### Public marketing

`/` · `/how-it-works` · `/for-creators` · `/for-businesses` · `/for-learners` · `/pricing` · `/about` · `/contact` · `/help` · `/privacy` · `/terms` · `/community-guidelines`

### Authentication and onboarding

`/auth/sign-up` · `/auth/sign-in` · `/auth/forgot-password` · `/auth/reset-password` · `/auth/verify-email` · `/auth/dev-outbox` (development only — shows the emails the console adapter wrote) · `/onboarding`

### Application shell

| Route | Purpose |
| --- | --- |
| `/home` | Personalised feed with filters, reactions, comments, saves, shares |
| `/explore` | Projects, people, skills, learning, businesses, challenges |
| `/search` | Global search across every content type |
| `/projects/new` | Four-step creation wizard with task breakdown, draft and publish |
| `/projects/[projectId]` | Project workspace: overview, progress, tasks, team, discussion, journeys, results, analytics |
| `/projects/[projectId]/tasks` | Task list and kanban board |
| `/projects/[projectId]/story` | Storyboard editor, review workflow and animated explainer |
| `/tasks/[taskId]` | Task detail, interest, assignment, submission and review |
| `/tasks/[taskId]/workspace` | Contributor documentation workspace |
| `/tasks/[taskId]/learning-journey` | Turn documented work into a learning journey |
| `/learn` | Learning library with filters |
| `/learn/[resourceId]` | Resource detail with server-side entitlement gating |
| `/learn/journeys/[journeyId]` | Learning journey |
| `/studio` | Creator studio overview |
| `/studio/products` · `/studio/products/new` · `/studio/sales` | Premium products, creation and sales/access |
| `/checkout/[productId]` | Honest "request access" checkout in this build (no card data) |
| `/chats` · `/chats/[conversationId]` | Direct messages and private project groups |
| `/notifications` | Notifications with filters and mark-as-read |
| `/u/[username]` | Public creator profile, contributions, reputation, teaching |
| `/business` · `/business/[businessId]` | Business accounts, team, portfolio, analytics |
| `/challenges` | Community challenges and opportunities |
| `/settings` | Profile, security, notifications, privacy, learning, creator, business, data export, deletion |
| `/admin` + `/admin/reports` `/admin/disputes` `/admin/users` `/admin/audit` `/admin/stories` | Protected moderation area |

### HTTP endpoints

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | Database, storage, provider and payment-mode status (no secrets) |
| `GET /api/files/[fileId]` | Private media delivery: HMAC-signed URL or an authorised session; `private` caching, `nosniff`, sandboxed CSP |
| `GET /api/account/export` | Authenticated JSON export of the caller's personal data |

---

## 5. Architecture in one paragraph

Every page is a server component that asks a **service** (`src/services/*`) for data. Every mutation is a **server action** (`src/app/actions/*`) that validates input, calls the same service, revalidates affected paths and redirects with a readable flash message. Services enforce **authorisation** through `src/lib/authz.ts` (`getProjectAccess`, `requireProjectAccess`, `getTaskAccess`, `requireTaskAccess`, `hasEntitlement`, `isBlockedEitherWay`), never through the UI. Multi-step writes run inside `transaction()`. Notifications and audit rows are written in the same flow as the change. Media never becomes a public file: uploads are sniffed for their real type, stored privately, and served through `/api/files/[fileId]`.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 6. Data model

63 tables covering users, profiles and preferences, skills, projects, members, invitations, follows, milestones, tasks, assignments, expressions of interest, submissions, reviews, work-log entries, deliverables, project updates, posts, comments, reactions, follows, saved items, conversations, messages, notifications, journeys and steps, resources, courses, modules, lessons, exercises, progress, feedback, products, orders, order items, payment events, entitlements, attributions, reputation events, achievements, reports, moderation actions, disputes, storyboards, scenes, generated media, approvals, consent records and audit logs.

The full ERD and table notes are in [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md). Migrations live in `db/migrations/`.

---

## 7. Honesty about the unfinished integrations

These are deliberate, documented boundaries — not hidden gaps.

1. **Payments are disabled.** No card details are collected, no charge is attempted, no webhook is trusted. Premium access is granted by the creator or an administrator and recorded as an `entitlements` row plus an order marked `creator_grant` / `admin_grant`. The price on a product is the intended listing price for when a compliant payment rail exists. `PAYMENTS_ENABLED=false`.
2. **The story generator is local and deterministic.** With `AI_PROVIDER=local` it composes narration only from approved source records, cites every scene back to the row that produced it, and reports missing material instead of inventing it. The animated explainer is a real, playable, self-contained SVG built from the approved storyboard, not a hosted video render. `src/lib/ai.ts` defines the `StoryProvider` interface a hosted LLM/video service plugs into.
3. **Email is a console adapter.** Messages are written to `data/outbox.log`; in development the verification/reset link is also shown in the UI. The `smtp` adapter throws until it is configured.
4. **Storage is a private local folder.** The S3 adapter is a documented seam that returns `501 storage_not_configured` until implemented.
5. **Rate limiting is in-memory per process.** Correct for a single node and for tests; a multi-instance deployment must move the buckets to Redis/Upstash.
6. **No OAuth, no MFA.** The schema and settings page have room for them; neither is claimed as working.
7. **Browser coverage is deliberately narrow, though no longer shell-only.** Playwright drives the real app for registration, the five-destination navigation and its per-page headers, horizontal swipe transitions, the Create sheet, the profile's account options, the Home-only notification bell and server-persisted read state, the Chats inbox with its search, message requests, live delivery to an open thread, thread send and new-message composer, Explore search across categories, the Settings theme, the project-creation wizard, submission → review → accepted work, journey drafting and publication, a moderation decision with its audit entry, and premium gating for unentitled and entitled readers. Storyboard generation and rendering, chat, courses and the business workspace are still exercised at the service level only.

---

## 8. Testing

```bash
npm test          # 251 integration tests across 23 suites
npm run test:e2e  # 41 Playwright checks against the real app
```

| Suite | Covers |
| --- | --- |
| `tests/auth.test.ts` | Registration, password hashing, duplicate accounts, rate limits, sign-in, verification, reset, password change, session revocation |
| `tests/account-context.test.ts` | Individual/creator/business account derivation and Create ordering |
| `tests/projects.test.ts` | Creation and validation, drafts, private visibility, owner-only edits/deletes, interest, invitations, removal, following, analytics access |
| `tests/project-creation-wizard.test.ts` | Project plus work areas and the whole task breakdown in one transaction; drafts keep their tasks |
| `tests/project-setup-and-task-chats.test.ts` | Publish validation, task work language, automatic task chats and Accepted Work |
| `tests/tasks.test.ts` | Task creation rules, interest → assignment → scope, submission, review, denial cases, self-review prevention, documentation visibility |
| `tests/work-areas.test.ts` | Work areas, quick projects, project chat and filing a chat message as a Drop |
| `tests/dependencies.test.ts` | Blocking dependencies and accepted-work collections |
| `tests/journeys-and-stories.test.ts` | Journey drafting from approved docs, owner approval gate, storyboard generation permissions, source citation, review before publish, consent withdrawal |
| `tests/learning.test.ts` | Publishing, discovery, paid preview requirements, server-side entitlement gating, grant/revoke permissions, progress and feedback |
| `tests/courses.test.ts` | Course structure, publication, enrolment, permissions and upload validation |
| `tests/library-and-activity.test.ts` | Liked posts and projects, your comments, following activity and assigned work |
| `tests/notifications.test.ts` | Task, comment, invitation, chat and teaching notifications plus delivery rules |
| `tests/profile-content.test.ts` | Profile posts, accepted work, feed preferences and visibility |
| `tests/recommendations.test.ts` | Project, people and learning recommendations |
| `tests/social-and-moderation.test.ts` | DM privacy preferences, blocking, group access revocation, comments/reactions/saves, moderation with reason codes and audit trail, disputes, data export and account deletion |
| `tests/social-shares.test.ts` | Sharing a project update and the share history |
| `tests/database-guards.test.ts` | Append-only audit history, one pending submission per task, clean migrations |
| `tests/form.test.ts`, `tests/routing.test.ts`, `tests/theme.test.ts`, `tests/navigation.test.ts` | FormData file reading, safe redirects, theme preference and the five-destination navigation contract |

Each Vitest suite runs against a throwaway SQLite database (`tests/setup.ts`), applies the real migrations, and exercises the same code paths the UI uses.

The browser suite (`e2e/`) starts its own server on port 3100 with a freshly migrated and seeded database (`.tmp-e2e/`). It registers a new account, signs in through the real form, and drives the shell, swipe navigation and its View Transitions, the profile's account options, notifications, Settings theme and project wizard. Specs that need a second role open their own context through the same sign-in form (`e2e/support.ts`), so a contributor, an administrator and an entitled learner are all real sessions rather than database fixtures. Touch gestures are delivered as real CDP touch events, so the swipe tests exercise the same listener path a phone does. It needs Chromium once: `npx playwright install chromium`. Playwright is pinned to 1.55 because the project still supports Node 18; newer releases require Node 20.

---

## 9. Security and privacy

See [`docs/SECURITY.md`](docs/SECURITY.md) for the checklist, the threat notes and what is intentionally *not* accessible to administrators (private project content). Highlights:

- Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production, and revoked on password change, deletion or sign-out.
- Every protected operation re-checks role, ownership and membership server-side; client-supplied roles, prices and statuses are ignored.
- Paid resource bodies, transcripts and paid lessons are removed from the response on the server, not hidden with CSS.
- Public documentation requires project-level permission *and* contributor consent; withdrawal immediately pulls entries back to team scope.
- Reports, moderation and disputes require reason codes, write audit rows and notify the affected people.
- Uploads are type- and size-checked and magic-byte sniffed; files are served with `X-Content-Type-Options: nosniff` and a sandbox CSP.
- Account deletion scrubs identifiers but keeps contribution history attributable to "Deleted account", which is required for other people's records to stay accurate.

---

## 10. Documentation index

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — diagrams, request flow, service boundaries, provider seams
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — ERD, table groups, indexes, migration workflow
- [`docs/API.md`](docs/API.md) — server actions, service contracts, HTTP endpoints
- [`docs/SECURITY.md`](docs/SECURITY.md) — security and privacy checklist, GDPR notes, known gaps
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — environment variables, hosting, PostgreSQL migration path, backups, health checks
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — MVP vs future, acceptance criteria status, external services required
- [`docs/PHASE1-AUDIT.md`](docs/PHASE1-AUDIT.md) — audit of this build against the production brief, ranked gaps and the decisions still open

---

## 11. Legal note

All people, projects, testimonials, metrics and stories in the seed data are fictional and labelled as demonstration data. Before any public launch, obtain qualified legal advice on the privacy notice, terms of service, consumer rights, intellectual-property licensing, unpaid and paid collaboration, marketplace arrangements and payment regulation. Nothing in this repository is legal advice.
