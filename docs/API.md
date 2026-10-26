# API and service contracts

This build has **no public REST API**. The application talks to the server through Next.js **server actions**, which call the **service layer**. The service layer is the real contract: it is fully typed, callable from tests, and the only place business rules live. The three route handlers that do exist are listed in §4.

## 1. Error model

All services throw `AppError` subclasses from `src/lib/errors.ts`:

| Error | HTTP intent | Used for |
| --- | --- | --- |
| `AppError` | 400 | Validation and rule violations with a user-readable message |
| `UnauthorizedError` | 401 | Missing or invalid session; uniform sign-in failure message |
| `ForbiddenError` | 403 | Authenticated but not permitted (also used for some 404-style denials, see below) |
| `NotFoundError` | 404 | Missing record, or a record the viewer may not know exists |
| `RateLimitError` | 429 | Rate limits, with a retry hint |

`runServerAction` turns any `AppError` into `?error=<message>` on the page it redirects back to. Authorisation failures on private projects are raised as `NotFoundError` so existence is never leaked.

## 2. Server actions (`src/app/actions/*`)

Every action is a `POST` server action that takes `FormData`, runs through `runServerAction(fallbackPath, fn)`, revalidates the affected paths and redirects. Actions never contain business rules.

### `auth.ts`
`signUpAction` · `signInAction` · `signOutAction` · `resendVerificationAction` · `verifyEmailAction` · `forgotPasswordAction` · `resetPasswordAction` · `onboardingAction` · `devVerifySelfAction` (development only, refuses in production)

### `account.ts`
`updateProfileAction` · `updateContentPrefsAction` · `updateNotificationsAction` · `changePasswordAction` · `deleteAccountAction`

### `projects.ts`
`createProjectAction` · `updateProjectAction` · `publishProjectAction` · `toggleProjectFollowAction` · `addMilestoneAction` · `setMilestoneStatusAction` · `postProjectUpdateAction` · `inviteToProjectAction` · `respondToInvitationAction` · `removeMemberAction` · `archiveProjectAction` · `deleteProjectAction`

### Tasks and collaboration (also `projects.ts`)
`createTaskAction` · `updateTaskAction` · `setTaskStatusAction` · `expressInterestAction` · `respondToInterestAction` · `assignContributorAction` · `removeAssigneeAction` · `confirmScopeAction` · `submitWorkAction` · `reviewSubmissionAction` · `disputeAttributionAction` · `correctAttributionAction` · `addWorkLogAction` · `updateWorkLogAction` · `approveWorkLogAction` · `withdrawConsentAction`

### `learning.ts`
`createResourceAction` · `createJourneyAction` · `addJourneyStepAction` · `publishJourneyAction` · `approveJourneyAction` · `draftJourneyFromTaskAction` · `recordProgressAction` · `feedbackAction` · `generateStoryAction` · `renderStoryAction` · `updateSceneAction` · `moveSceneAction` · `submitStoryAction` · `decideStoryAction` · `publishStoryAction` · `consentAction`

### `commerce.ts`
`createProductAction` · `updateProductAction` · `publishProductAction` · `grantAccessAction` · `requestAccessAction` · `requestAccessFromProductAction` · `revokeAccessAction`

### `social.ts`
`createPostAction` · `deletePostAction` · `commentAction` · `reactAction` · `saveAction` · `followUserAction` · `blockUserAction` · `reportAction` · `updatePrivacyAction` · `reportProjectMisattributionAction`

### `chat.ts`
`startDirectMessageAction` · `openProjectChatAction` · `sendMessageAction` · `markReadAction` · `muteConversationAction` · `leaveConversationAction` · `reportMessageAction`

### `notifications.ts`
`markAllReadAction` · `markReadAction`

### `admin.ts`
`moderateAction` · `resolveDisputeAction` · `setUserRoleAction` · `createBusinessAction` · `updateBusinessAction` · `addBusinessMemberAction` · `removeBusinessMemberAction`

## 3. Service layer (`src/services/*`)

Signatures below are abridged; the source is the reference.

### `users.ts` — identity and profile
```ts
registerUser({ email, password, displayName, username, roles?, ip? }): Promise<{ userId, username, devVerificationUrl? }>
authenticate(email, password, ip?): { user, session }
verifyEmailToken(token): string
resendVerification(userId): { token? }
requestPasswordReset(email): Promise<{ token? }>          // always resolves, never enumerates
resetPassword(token, newPassword): void                   // revokes all sessions
changePassword(userId, current, next, confirm): void
completeOnboarding(userId, input): void
updateProfile(...) · updateSkills(userId, names) · updatePreferences(userId, patch)
followUser(a, b) · isFollowing(a, b) · followerCounts(id) · listFollowers(id) · listFollowing(id)
blockUser(blockerId, blockedId, reason?) · unblockUser(...) · listBlocked(userId)
exportUserData(userId)                                    // no passwordHash, ever
deleteAccount(userId, confirmation)                       // requires exact username
searchPeople(query, limit?)
```

### `projects.ts` — projects and teams
```ts
createProject(ownerId, input): { id, slug }               // validates name/description/compensation
createQuickProject(ownerId, { name, goal?, shortDescription, visibility })  // four fields + team chat
updateProject(projectId, viewer, patch)
publishProject(id, viewer) · archiveProject(id, viewer) · deleteProject(id, viewer, typedName)
projectDetail(id, viewer)                                 // null when not viewable
listProjects(filters, viewer) · countProjects(filters) · featuredProjects(limit?)
toggleProjectFollow(id, userId): boolean
addMilestone(...) · setMilestoneStatus(...) · postProjectUpdate(...)
inviteToProject(id, viewer, { userId?, email?, role, message? })
respondToInvitation(invitationId, userId, accept) · pendingInvitations(userId) · removeMember(id, viewer, userId)
projectAnalytics(id, viewer)                              // owner only
```

### `tasks.ts` — work, interest, review, evidence
```ts
createTask(projectId, viewer, input): string              // acceptance criteria required to publish
updateTask(taskId, viewer, patch) · setTaskStatus(taskId, viewer, status)
listTasks(projectId, viewer) · taskDetail(taskId, viewer)
expressInterest(userId, { projectId, taskId?, intent, message?, workSamples? }): string
projectInterests(projectId, viewer) · respondToInterest(eoiId, viewer, decision, message?)
assignContributor(taskId, viewer, userId, responsibilities?) · confirmScope(taskId, userId) · removeAssignee(...)
submitWork(taskId, userId, { note, files }): string
reviewSubmission(submissionId, viewer, "accepted" | "revision_requested", reason?): void
listAttributions(userId) · disputeAttribution(attributionId, raisedBy, { subject, details })
correctAttribution(attributionId, viewer, { role?, summary? })
openTasksForProject(projectId) · upcomingDeadlines(userId)
```

Acceptance semantics: `reviewSubmission("accepted")` is the **only** path that creates a `contributor_attributions` row, marks deliverables approved, awards reputation, and notifies the contributor. An upload on its own is never evidence. Acceptance also calls `notifyDependentsReady` so work whose prerequisites are now all approved is reported as ready.

### `dependencies.ts` — prerequisites between tasks
```ts
addDependency(taskId, viewer, { dependsOnTaskId, reason? }): string   // same project, no self-links, no cycles
removeDependency(dependencyId, viewer) · listTaskDependencies(taskId, viewer)
taskReady(taskId): boolean                                  // every prerequisite completed
notifyDependentsReady(completedTaskId, actorId)             // called after acceptance only
```

Dependency state is always derived from the prerequisite task's status, so there is no second status to keep in sync. Readiness never auto-approves dependent work and never changes its status.

### `accepted.ts` — the canonical Accepted Work collection
```ts
projectAcceptedWork(projectId, viewer) // { items, areas, canViewFiles }
```

One row per approved `deliverables` record — the same record the task page renders. Grouping uses the task's skill category ("Design", "Software", …) and falls back to "General". Outsiders see only accepted work from public tasks on projects they may view; file links are members-only.

### `worklog.ts` — contributor documentation
```ts
addWorkLogEntry(taskId, userId, { kind, title, body?, linkUrl?, fileId?, visibility }): string
listWorkLogEntries(taskId, viewer)                        // filters by scope and author
updateWorkLogEntry(entryId, userId, patch)                // author only, keeps edit history
approveWorkLogEntry(entryId, viewer)                      // reviewer/owner, public_pending → public
withdrawConsent(userId, projectId)                        // revokes consent and demotes entries to team
workspaceFor(taskId, viewer) · approvedSourcesForProject(projectId)
```

Visibility rules are enforced in the service: `public`/`public_pending` require the project's `allow_public_docs`; a non-assignee's `public` request degrades to `public_pending`; a consent row is written on submission.

### `learning.ts` — journeys and resources
```ts
createJourney(creatorId, input): string · addJourneyStep(journeyId, userId, input)
draftJourneyFromTask(taskId, userId): { journeyId, skipped }   // deterministic, cites each source row
publishJourney(journeyId, userId) · approveJourney(journeyId, viewer)
journeyDetail(id, viewer) · projectJourneys(projectId, viewer) · journeysFor(userId)

createResource(creatorId, input): { id, slug }            // paid needs a preview
listResources(filters) · resourceDetail(id, viewer)       // server-side entitlement gating
recordProgress(userId, resourceId, lessonId, completed) · addFeedback(userId, resourceId, rating, body?)
resourcesForCreator(id) · resourcesForProject(id, viewer) · learningTopics() · myLearning(userId)
```

`resourceDetail` returns `body: null`, `transcript: null`, no paid lessons and no exercises when the viewer lacks entitlement. This is a server-side withholding, not a UI toggle.

### `commerce.ts` — products and entitlements
```ts
createProduct(creatorId, input): string · updateProduct(id, creatorId, patch) · publishProduct(id, creatorId)
productsForCreator(creatorId) · productDetail(id, viewerId?)
grantAccess({ productId, buyerEmailOrUsername, grantedBy, isAdmin?, note?, expiresAt? }): { orderId, entitlementId }
requestAccess(productId, userId, note?)                   // honest alternative to a disabled checkout
revokeAccess(entitlementId, actorId, reason, isAdmin?)    // audits, notifies, marks the order revoked
entitlementsForUser(userId) · entitlementsForProduct(id) · salesSummary(creatorId) · purchaseHistory(userId)
```

`grantAccess` is restricted to the product's creator or an administrator. `PAYMENTS_ENABLED=false` means no money moves and every order carries `method: creator_grant | admin_grant`.

### `stories.ts` — AI story and animation
```ts
collectSources(projectId, viewer): StorySource[]          // public, approved material only
consentedUsers(projectId): string[]
generateStoryboard(projectId, viewer): Promise<{ id, warnings }>
renderStoryboard(storyboardId, viewer): Promise<void>      // writes generated_media
storyboardDetail(id, viewer) · storyboardsForProject(projectId, viewer)
updateScene(sceneId, viewer, patch) · moveScene(sceneId, viewer, direction)
submitStoryForReview(id, viewer) · decideStory(id, viewer, decision, note?)
publishStory(id, viewer)                                   // requires approval + rendered media
publishedStories(limit?) · grantConsent(...) · revokeConsent(...) · storyResource(projectId)
```

`collectSources` includes: public work-log entries, approved deliverables on the project's tasks, completed milestones, and public project updates. Team-only entries are excluded even for the owner. `StorySource.approved` is part of the provider input so a hosted provider can refuse unapproved material too.

### `chat.ts` — messaging
```ts
listConversations(userId) · unreadMessageCount(userId)
getOrCreateDirectConversation(a, b): string                // enforces blocks + recipient DM policy
ensureProjectGroup(projectId, actorId): string             // active members only; syncs team membership
ensureGroupConversation(projectId, title, actorId, existingId?): string
ensureTaskChat(taskId, viewer): string                     // the task's chat, created on first open
conversationScope(conversationId)                          // { projectId, taskId } for filing uploads
conversationDetail(id, userId) · markConversationRead(id, userId)
sendMessage(id, senderId, { body, attachmentId?, parentId? }): string   // one reply level
createDropFromMessage(messageId, viewer): string            // project edit permission; private task in the chat's area
muteConversation(id, userId, muted) · leaveConversation(id, userId)
reportMessage(messageId, reporterId, reasonCode, details?)
```

### `workAreas.ts` — role-style workspaces inside a project
```ts
listWorkAreas(projectId, viewer)                          // counts derived from real tasks
createWorkArea(projectId, viewer, { name, description? }): string   // owner/admin only, creates its chat
ensureWorkAreaChat(areaId, viewer): string                  // members only, creates lazily
assignTaskToArea(taskId, viewer, areaId | null)
workAreaForConversation(conversationId)
workAreaDropdown(projectId) · deleteWorkArea(areaId, viewer)
```

A work area is a project-scoped row, not a global role: it owns a group conversation, is the preferred grouping for Accepted Work, and never grants access on its own — project membership still decides who can see anything.

### `profileContent.ts` — what a profile can show
```ts
acceptedWorkForUser(userId)                          // attributions + approved deliverables, same records as the project
learningHistoryFor(userId)                           // completed learning only
sharesLearningHistory(userId)                        // explicit opt-in, default false
```

Learning history is never public unless `user_preferences.share_learning_history` is true. Teaching visibility uses the existing `profileVisibility.learning` setting; contribution records use `profileVisibility.contributions`.

### `social.ts` — feed and discussion
```ts
feed(filters) · createPost(authorId, input) · deletePost(id, viewer) · hidePost(id, userId)
addComment(authorId, { targetType, targetId, body, parentId? }) · listComments(targetType, targetId, viewer)
toggleReaction(userId, targetType, targetId) · reactionState(...)
toggleSaved(userId, targetType, targetId) · savedFor(userId) · savedSearches?
createPost(authorId, { body, kind?, projectId?, resourceId?, imageId?, altText?, visibility?, publish? }): string
postDetail(postId, viewer) · postsByAuthor(authorId, viewerId, limit?)
searchAll(query, limit?) · listChallenges() · listBusinesses(query?) · teamMemberIds(projectId)
```

### `profile.ts` / `business.ts` / `admin.ts`
```ts
projectHistory(userId) · contributionCounts(userId) · verifiedContributions(userId) · attributedSkills(userId)

createBusiness(ownerId, input) · businessDetail(id, viewerId?) · userBusinesses(userId) · updateBusiness(...)
addBusinessMember(...) · removeBusinessMember(...) · businessAnalytics(id, viewerId)

platformMetrics() · listReports(status?) · reportDetail(id) · applyModeration({ reportId, moderatorId, action, reasonCode, notes })
listDisputes() · resolveDispute(id, moderatorId, decision, resolution)
adminUserList(query?) · setUserRole(adminId, userId, role, grant) · auditTrail(limit?)
storyReviewQueue() · assertModerator(user) · reportCountsByReason()
```

`applyModeration` requires a known reason code and internal notes, refuses an already-closed report, writes a `moderation_actions` row, an `audit_logs` row, notifies the reporter and the affected person, and resolves the report.

## 4. HTTP endpoints

### `GET /api/health`
Public, no secrets. `200` with:
```json
{ "status": "ok", "database": "ok", "storage": "local", "narrationProvider": "local",
  "videoProvider": "local", "email": "console", "paymentsEnabled": false,
  "uptimeSeconds": 64, "checkMs": 0 }
```
`status` becomes `"degraded"` with a non-200 code if the database probe fails. Suitable for a platform health check.

### `GET /api/files/[fileId]`
Private media delivery. Access is granted if either:
1. the query string carries a valid short-lived HMAC signature (`?expires=&signature=`), or
2. the request has a session whose `canAccessMedia(file, viewer)` check passes (owner, project team, conversation member, or public media).

Failures return `404` for both "missing" and "not yours". Responses set `Content-Type` from the stored MIME type, `Content-Disposition` (inline, or attachment with `?download=1`), `Cache-Control: private`, `X-Content-Type-Options: nosniff` and a `default-src 'none'; sandbox` CSP.

### `GET /api/account/export`
Authenticated. Returns the caller's personal data as JSON (profile without credentials, roles, preferences, skills, follows, feedback given, memberships, conversation memberships). This is the data-subject access path referenced in `docs/SECURITY.md`.

## 5. Conventions

- **Viewer**: services take `viewer: { id, isAdmin?, isModerator? } | null` and derive permissions themselves. Callers never pass a role to grant access.
- **Pagination**: list functions accept `limit` (and `offset` where the page supports it) and are capped in SQL. Discovery pages read `page`/`q`/filters from search params.
- **Idempotency**: reputation awards are idempotent per source row; reaction/save/follow toggles are deterministic; `grantAccess` refuses a duplicate entitlement; moderation refuses a closed report.
- **Notifications** are written by the service that changes state, in the same flow, via `src/lib/notify.ts`.
- **Audit rows** are written for every sensitive administrative action and for entitlement, story and moderation changes.
