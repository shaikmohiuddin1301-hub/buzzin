# Roadmap and delivery status

## 1. Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project structure, design system, schema + migrations, auth, onboarding | **Done** |
| 2 | Project creation, feed, discovery, project detail, tasks, expressions of interest | **Done** |
| 3 | Contributor workspace, documentation visibility, file permissions, review flow | **Done** |
| 4 | Creator profiles, learning journeys, learning library, reputation | **Done** |
| 5 | Storyboard generation, review workflow, animated explainer prototype | **Done with the local deterministic provider; hosted AI/video is a seam** |
| 6 | Chat, notifications, business accounts, admin moderation | **Done** (chat polls rather than pushing) |
| 7 | Premium products, test-mode access grants, entitlements | **Done — payments deliberately disabled, grants recorded honestly** |
| 8 | Analytics, accessibility, security review, testing, deployment docs | **Done to the level documented in `docs/SECURITY.md`; independent review, load testing and browser E2E are outstanding** |

## 2. Acceptance criteria

Every item below is implemented and, where a service exists, covered by an integration test. "Evidence" names the test file that proves it.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Register and create a profile | ✅ | `tests/auth.test.ts`; onboarding page |
| Create and discover a project | ✅ | `tests/projects.test.ts`; `/explore`, `/projects/new` |
| Follow a project or creator | ✅ | `tests/projects.test.ts` (follow toggle + counter), `tests/social-and-moderation.test.ts` (user follow) |
| Express interest in a task | ✅ | `tests/projects.test.ts`, `tests/tasks.test.ts` |
| Accept a contributor and restrict private access | ✅ | `tests/projects.test.ts` (private visibility, invitations, removal) |
| Create a task and submit work | ✅ | `tests/tasks.test.ts` |
| Document the work process | ✅ | `tests/tasks.test.ts` (private/team visibility), `/tasks/[id]/workspace` |
| Review and confirm or dispute contribution records | ✅ | `tests/tasks.test.ts` (accept creates owner-confirmed attribution), `tests/social-and-moderation.test.ts` (dispute + resolution) |
| Build a learning journey from approved work | ✅ | `tests/journeys-and-stories.test.ts` |
| Preview a story/storyboard linked to its source material | ✅ | `tests/journeys-and-stories.test.ts` (every scene cites `source_type`/`source_id`) |
| Publish free learning content | ✅ | `tests/learning.test.ts` |
| Create a premium learning product in test mode | ✅ | `tests/learning.test.ts` (product, grant, revoke, gating) |
| See relevant profile and project reputation information | ✅ | `src/lib/reputation.ts`, profile page, `tests/tasks.test.ts` (reputation after acceptance) |
| Use chat and notifications | ✅ | `tests/social-and-moderation.test.ts`; `/chats`, `/notifications` |
| Report content and block another user | ✅ | `tests/social-and-moderation.test.ts` |
| Manage privacy settings | ✅ | `tests/social-and-moderation.test.ts` (DM policy), `/settings?tab=privacy` |
| Automated tests cover the important permissions and data flows | ✅ | 66 tests across 6 suites; `npm test` |

**Not claimed as met:** a real payment journey (no rail, by design), OAuth/MFA sign-in, hosted AI video, email delivery over SMTP, and automated browser E2E tests.

## 3. What is deliberately not built

These are product boundaries, not bugs:

1. **No payment processing.** No card fields, no provider SDK, no webhook endpoint. Premium access is an entitlement granted by the creator or an admin, and every order records that fact. Pricing pages label prices as illustrative. Payment work must wait for eligibility, KYC, consumer-law and marketplace review.
2. **No hosted AI or video call.** The local provider is deterministic and cites every scene. Swapping in a hosted model is an adapter change, not a rewrite — and the safeguards (approved sources only, consent, review before publish) stay in the service layer regardless of provider.
3. **No social login.** Adding OAuth would also require account-linking and verification rules; not worth doing half-way.

## 4. Next up (in order)

1. **Browser end-to-end tests** (Playwright) for sign-up → project → task → submission → review → journey, plus admin moderation and entitlement gating.
2. **PostgreSQL migration** using the path in `docs/DEPLOYMENT.md`, then horizontal scaling, Redis rate limits and a job queue for generation and notifications.
3. **Email delivery** (SMTP or an API provider) with SPF/DKIM/DMARC, plus real verification/reset flows for production.
4. **Object storage** behind the existing `StorageAdapter` with signed URLs and lifecycle rules; malware scanning and image re-encoding on upload.
5. **Admin hardening**: MFA for staff, fine-grained permissions, appeal SLAs, retention policies and exportable audit reports.
6. **Realtime chat** (WebSocket or a managed realtime service) replacing polling, with delivery receipts and typing state.
7. **Analytics aggregation**: nightly rollups, creator dashboards with date ranges, and honest labelling of estimates vs confirmed outcomes.
8. **Accessibility audit**: automated axe checks in CI plus manual screen-reader passes; finish dark mode using the existing CSS variables.
9. **Recommendation quality**: skill/interest matching with explanations, diversity constraints so already-popular creators are not permanently privileged, and clear "promoted" labels if paid placement is ever introduced.
10. **Payments and marketplace** once legally cleared: provider integration, webhook signature verification, refunds, tax handling, creator payouts and dispute handling.

## 5. External services and configuration required

The application runs with **zero external services**. Each row below is a seam that must be configured before a real launch; choose vendors only after checking current pricing, data-processing terms, regional availability and the platform's eligibility requirements.

| Capability | Current behaviour | What must be configured | Where |
| --- | --- | --- | --- |
| Transactional email | Console adapter writes to `data/outbox.log` | SMTP credentials or an email API key, a verified sending domain, SPF/DKIM/DMARC | `src/lib/email.ts` |
| Object storage | Private local folder | Bucket, region, credentials, signed-URL policy, lifecycle rules | `src/lib/storage.ts` |
| LLM narration/storyboard | Local deterministic generator | Provider key, model name, a data-processing agreement, a policy that refuses non-approved source material | `src/lib/ai.ts` |
| Video/motion graphics | Animated SVG export | Provider key and a render callback that returns a video file | `src/lib/ai.ts` (`renderExplainer`) |
| Rate limiting | In-memory fixed windows | Shared store (Redis/Upstash) credentials | `src/lib/rate-limit.ts` |
| Payments | Disabled | Marketplace-capable provider account, KYC, webhook secret, refund policy, tax handling | new adapter + `PAYMENTS_ENABLED` |
| Hosting | Local Node process | Node host with persistent disk, HTTPS, health check on `/api/health` | `docs/DEPLOYMENT.md` |
| Database (production) | SQLite file | Managed PostgreSQL, backups, PITR | `docs/DEPLOYMENT.md` §5 |
| Monitoring | Console logs only | Error tracking and uptime monitoring with alerting | new |
| Malware scanning | Not present | Scanner in the upload path | `src/lib/storage.ts` |
| CAPTCHA/abuse defence | Rate limits only | Optional challenge on registration and reporting | new |

## 6. Product ideas beyond the MVP

- Project templates and a guided "first task" for new creators.
- Cohort workshops with scheduled sessions and attendance.
- Team-level reputation and business-verified contribution records (clearly distinguished from platform-verified ones).
- Skill endorsements restricted to people who worked with you, to reduce reciprocal-rating abuse.
- Localisation (copy and date/number formatting are centralised in `src/lib/format.ts`).
- Offline-friendly contributor notes (draft locally, sync on reconnect).
- Public API and webhooks for businesses, with scoped tokens and audit logging.
