# Security and privacy

This document is both a checklist of what is implemented and an honest list of what a production deployment still needs. It is not a substitute for a professional security review or legal advice.

## 1. Authentication and sessions

| Control | Status | Where |
| --- | --- | --- |
| Password hashing with scrypt (memory-hard, per-password salt, parameters stored with the hash) | ✅ | `src/lib/password.ts` |
| Constant-time hash comparison | ✅ | `verifyPassword` uses `timingSafeEqual` |
| Session token: 32 random bytes, stored **hashed** (SHA-256) in `sessions` | ✅ | `src/lib/session.ts` |
| Cookie `httpOnly`, `sameSite=lax`, `secure` when `NODE_ENV=production` | ✅ | `src/lib/auth.ts` |
| Session expiry (`SESSION_TTL_DAYS`, default 30) and periodic purge helper | ✅ | `purgeExpiredSessions` |
| Sessions revoked on sign-out, password change, password reset and account deletion | ✅ | `revokeSession`, `revokeAllSessions` |
| Email verification tokens: random, hashed, single use, 24h expiry | ✅ | `src/services/users.ts` |
| Password reset tokens: random, hashed, single use, 1h expiry | ✅ | `src/services/users.ts` |
| Uniform sign-in failure message (no account enumeration) | ✅ | "Email or password is incorrect." |
| Password reset always reports success, even for unknown emails | ✅ | `requestPasswordReset` |
| Suspended/deleted accounts refused at sign-in | ✅ | `authenticate` |
| Login throttling (`RATE_LIMIT_AUTH_PER_MINUTE`, default 10/min per IP+email) | ✅ | `src/lib/rate-limit.ts` |
| Registration throttling (5/min per IP) | ✅ | `registerUser` |
| OAuth sign-in | ❌ not implemented | — |
| Multi-factor authentication | ❌ not implemented | Schema/service seam only |
| Breached-password checking | ❌ not implemented | Add at sign-up/reset |

**Gap:** rate limiting is in-memory per process. A multi-instance deployment must move the buckets to Redis/Upstash with the same `rateLimit(key, limit, windowMs)` signature, otherwise limits are per replica.

## 2. Authorisation

Every protected operation is checked on the server, in the service layer, against the *session user* — never against values supplied by the client.

| Rule | Enforced in |
| --- | --- |
| Only owners and project admins edit a project, its team and its tasks | `requireProjectAccess(…, "edit")` |
| Only accepted members reach private workspaces and team chat | `requireProjectAccess(…, "team")`, `getTaskAccess().canViewWorkspace` |
| Reviewers and owners only can review submissions; nobody reviews their own | `requireTaskAccess(…, "review")`, explicit self-review check |
| Only the assignee submits work | `requireTaskAccess(…, "submit")` |
| Only the project owner manages stories; approval needs `in_review`; publication needs `approved` + rendered media | `src/services/stories.ts` |
| Paid bodies/transcripts/lessons withheld without an entitlement | `resourceDetail` |
| Only the creator or an administrator grants/revokes entitlements | `grantAccess`, `revokeAccess` |
| A contributor cannot accept their own interest, approve their own attribution or verify their own disputed record | `respondToInterest`, `reviewSubmission`, `correctAttribution` |
| Private project content is **not** visible to platform admins | `getProjectAccess` (no admin bypass) |
| Admin/moderation actions need a reason code, notes and a role | `applyModeration`, `assertModerator` |
| Client-supplied roles, prices, ownership ids and payment status are ignored | No service accepts them as authority |

Private projects return `404`, not `403`, so outsiders cannot probe for existence.

## 3. Input handling and web hardening

- **Validation in services**: lengths, enums, numeric ranges and cross-record rules (e.g. a task must belong to the project named in an interest request). React/Next escape output by default; no `dangerouslySetInnerHTML` is used for user content.
- **SQL injection**: all queries go through Drizzle's parameter binding; the only raw fragments are static SQL with bound parameters.
- **CSRF**: mutations are Next.js server actions, which Next validates against the request origin, combined with `SameSite=lax` session cookies and `httpOnly`. There is no separate CSRF token because there is no cross-origin write surface.
- **Security headers** (`next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/microphone/geolocation, `Cross-Origin-Opener-Policy: same-origin`, and `poweredByHeader: false`.
- **Gap:** a page-level Content-Security-Policy is not set (only on the file route). Add one at the reverse proxy or via `headers()` once the final asset origins are known.

## 4. Uploads and media

| Control | Status |
| --- | --- |
| Size limit (`MAX_UPLOAD_MB`, default 10) checked before writing | ✅ |
| MIME allowlist (`ALLOWED_UPLOAD_TYPES`) | ✅ |
| Magic-byte sniffing: declared type must match the file signature | ✅ (`sniffMatches`) |
| Filenames sanitised; stored key generated, not user-controlled | ✅ |
| Private storage directory outside the web root; no public URLs | ✅ |
| Delivery only through `/api/files/[fileId]` with an authorised session or short-lived HMAC signature | ✅ (`signedMediaUrl`, 15 min) |
| `nosniff`, `private` caching, sandboxed CSP on file responses | ✅ |
| Malware scanning | ❌ not implemented — required before accepting arbitrary public uploads |
| Image re-encoding / EXIF stripping | ❌ not implemented |
| Automated orphaned-file cleanup | ❌ not implemented |

Media rows carry `visibility` and owner/project links; `canAccessMedia` allows public media, the owner, active project members, conversation members, and administrators on public records only.

## 5. Privacy and UK GDPR posture

| Requirement | Implementation |
| --- | --- |
| Lawful, minimal collection | Only account, profile, project and learning data needed for the product. No special-category data. |
| Consent for public storytelling | `consent_records` (scope `public_story`, `voice`, `likeness`), granted/revoked with timestamps; withdrawal immediately demotes the contributor's public entries to team scope and removes them from future generation. |
| Purpose limitation for AI | Only public, approved project material is eligible; team/private/client-restricted content is excluded even for the project owner. |
| Data export | `/api/account/export` and `exportUserData` — credentials excluded. |
| Deletion | `deleteAccount` scrubs identifiers, preferences, skills, blocks and sessions; keeps contribution history under "Deleted account" so other people's records stay accurate (documented in the UI and `docs/DATA-MODEL.md`). |
| Visibility controls | Profile-level (`profileVisibility`, `allowDirectMessages`, `showEmail`) and content-level (project visibility, task visibility, work-log visibility, post/comment state). All enforced server-side. |
| Minimum access for staff | Admins cannot read private project content; moderation works from reports and public metadata. |
| Retention | ❌ no automated retention policy or purge job. Must be defined before launch (see §8). |
| Children's data | The product is not intended for under-16s; this must be stated in the terms and enforced by policy. |
| International transfers | Depends on the hooks chosen (email, storage, AI). Document sub-processors before launch. |

## 6. Abuse prevention

- Rate limits on auth, registration, password reset, story generation (`RATE_LIMIT_AI_PER_HOUR`), messaging (60/min per sender), reporting (8/hour per reporter).
- Blocking is mutual for messaging: `isBlockedEitherWay` is checked on DM creation and on every message send.
- Reporting exists for users, projects, posts, comments, resources, messages and stories, with required detail text.
- Moderation requires reason codes; every action writes `moderation_actions` and `audit_logs`, and notifies the reporter and the affected person.
- Reputation awards are idempotent per source row to resist duplicate-submission farming; feedback is one row per learner per resource; a creator cannot rate their own resource; only entitled learners can rate paid material.
- **Gaps:** no automated spam/toxicity detection, no device/IP reputation, no appeal queue SLA tooling, no sybil resistance beyond rate limits.

## 7. Operational security checklist

- [x] Secrets only from environment variables; `.env.example` contains placeholders only; `.env.local` is git-ignored.
- [x] No secret is referenced in client components (only `NEXT_PUBLIC_APP_URL` is public).
- [x] Errors are converted to plain messages for users; stack traces are not returned.
- [x] Audit trail for moderation, role changes, entitlement grants/revocations, story approvals and publication.
- [x] Database foreign keys and transactions protect multi-step writes.
- [ ] Structured logging with request ids (currently `console` only, two call sites).
- [ ] Secret scanning and dependency scanning in CI.
- [ ] Backups with tested restore (see `docs/DEPLOYMENT.md`).
- [ ] Alerting on error rate, auth failures and moderation backlog.
- [ ] Penetration test before public launch.
- [ ] `SESSION_SECRET` rotation procedure and forced sign-out for all sessions.

## 8. Required before public launch

1. Replace SQLite with PostgreSQL and enable managed backups with point-in-time recovery.
2. Move rate limits to a shared store; add a WAF or edge rate limiting.
3. Add malware scanning and image re-encoding to the upload path.
4. Add a page-level CSP and HTTPS-only HSTS at the proxy.
5. Implement SMTP/API email delivery with SPF, DKIM and DMARC.
6. Define and implement retention: expired sessions, orphaned media, closed reports, deleted-account tombstones, audit log retention.
7. Appoint a data protection contact, publish a lawful privacy notice, record processing activities and sign DPAs with every processor.
8. Obtain legal review of terms, consumer rights, refunds, IP licensing, unpaid collaboration and any payment/marketplace obligation.
9. Add MFA for administrators and a break-glass procedure.
10. Commission an independent security test and fix what it finds.

## 9. Reporting a problem

Until a formal security contact is published, use the contact page and mark the message **security**. Do not test against production data you do not own.
