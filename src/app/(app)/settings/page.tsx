import Link from "next/link";
import { Download, KeyRound, ShieldCheck } from "lucide-react";
import {
  changePasswordAction,
  deleteAccountAction,
  updateContentPrefsAction,
  updateNotificationsAction,
  updateProfileAction,
} from "@/app/actions/account";
import { blockUserAction, updatePrivacyAction } from "@/app/actions/social";
import { correctAttributionAction, disputeAttributionAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { ReportForm } from "@/components/report-form";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  Checkbox,
  DefinitionList,
  Divider,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { NOTIFICATION_KINDS, PROJECT_CATEGORIES, label } from "@/lib/types";
import { getUserById, getPreferences, listBlocked, userSkillsFor, getUserRolesList } from "@/services/users";
import { listAttributions } from "@/services/tasks";
import { entitlementsForUser, productsForCreator, salesSummary } from "@/services/commerce";
import { userBusinesses } from "@/services/business";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "preferences", label: "Content" },
  { id: "contributions", label: "Contributions" },
  { id: "creator", label: "Creator" },
  { id: "account", label: "Account" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const session = await requireUser();
  const tab = typeof query.tab === "string" && TABS.some((entry) => entry.id === query.tab) ? query.tab : "profile";

  const user = getUserById(session.id)!;
  const prefs = getPreferences(session.id)!;
  const skills = userSkillsFor(session.id);
  const roles = getUserRolesList(session.id);
  const blocked = listBlocked(session.id);
  const attributions = listAttributions(session.id);
  const products = productsForCreator(session.id);
  const sales = salesSummary(session.id);
  const purchases = entitlementsForUser(session.id);
  const businesses = userBusinesses(session.id);
  const notify = prefs.notifyMatrix ?? {};

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Profile, security, privacy and creator controls. Every setting here is enforced on the server."
        actions={
          <ButtonLink href={`/u/${user.username}`} variant="secondary" size="sm">
            View public profile
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={tab}
        items={TABS.map((entry) => ({ ...entry, href: `/settings?tab=${entry.id}` }))}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {tab === "profile" ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Public profile</h2>
              <p className="mt-0.5 text-[12px] text-navy-500">Shown on your profile, project pages and contributions.</p>
              <form action={updateProfileAction} encType="multipart/form-data" className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar name={user.displayName} size={56} src={user.avatarFileId ? `/api/files/${user.avatarFileId}` : null} />
                  <div className="flex-1">
                    <Field label="Profile image" htmlFor="avatar" hint="PNG, JPEG or WebP up to 10 MB.">
                      <Input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
                    </Field>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Display name" htmlFor="displayName">
                    <Input id="displayName" name="displayName" defaultValue={user.displayName} maxLength={60} required />
                  </Field>
                  <Field label="Username" htmlFor="username" hint="Contact support to change your username.">
                    <Input id="username" defaultValue={user.username} disabled />
                  </Field>
                  <Field label="Location" htmlFor="location">
                    <Input id="location" name="location" defaultValue={user.location ?? ""} maxLength={80} placeholder="Manchester, UK" />
                  </Field>
                  <Field label="Time zone" htmlFor="timezone">
                    <Input id="timezone" name="timezone" defaultValue={user.timezone ?? ""} maxLength={60} placeholder="Europe/London" />
                  </Field>
                </div>
                <Field label="Biography" htmlFor="bio" hint="No personal contact details required.">
                  <Textarea id="bio" name="bio" rows={4} defaultValue={user.bio ?? ""} maxLength={1200} />
                </Field>
                <Field label="Portfolio links" htmlFor="portfolioUrls" hint="One URL per line, up to five.">
                  <Textarea id="portfolioUrls" name="portfolioUrls" rows={3} defaultValue={(user.portfolioUrls ?? []).join("\n")} />
                </Field>
                <Field label="Skills" htmlFor="skills" hint="Comma separated. These are self-declared; evidence comes from confirmed work.">
                  <Input id="skills" name="skills" defaultValue={skills.map((skill) => skill.name).join(", ")} />
                </Field>
                <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
              </form>
            </Card>
          ) : null}

          {tab === "security" ? (
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-navy-950">
                  <KeyRound size={14} aria-hidden="true" /> Change password
                </h2>
                <p className="mt-0.5 text-[12px] text-navy-500">All other sessions are revoked when you change your password.</p>
                <form action={changePasswordAction} className="mt-3 space-y-3">
                  <Field label="Current password" htmlFor="currentPassword">
                    <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
                  </Field>
                  <Field label="New password" htmlFor="newPassword" hint="At least 10 characters.">
                    <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
                  </Field>
                  <Field label="Confirm new password" htmlFor="confirmPassword">
                    <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
                  </Field>
                  <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
                </form>
              </Card>

              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-navy-950">Sessions and verification</h2>
                <DefinitionList
                  items={[
                    { term: "Email", value: user.email },
                    {
                      term: "Email verified",
                      value: user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : <Badge tone="warning">Not verified</Badge>,
                    },
                    { term: "Account created", value: formatDate(user.createdAt) },
                    { term: "Roles", value: roles.join(", ") || "member" },
                  ]}
                />
                <Alert tone="info" title="Multi-factor authentication is not implemented">
                  The session model supports adding a TOTP factor, but no MFA step is enabled in this build. Do not rely on this
                  deployment for high-value accounts without configuring it.
                </Alert>
              </Card>
            </div>
          ) : null}

          {tab === "notifications" ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Notification preferences</h2>
              <p className="mt-0.5 text-[12px] text-navy-500">
                In-app notifications are always stored; these switches control which categories are delivered. Email delivery is
                not configured in this build.
              </p>
              <form action={updateNotificationsAction} className="mt-4 space-y-4">
                <fieldset>
                  <legend className="field-label">Categories</legend>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {NOTIFICATION_KINDS.filter((kind) => kind !== "system").map((kind) => (
                      <Checkbox
                        key={kind}
                        name={`notify_${kind}`}
                        label={label(kind)}
                        defaultChecked={notify[kind] ?? true}
                      />
                    ))}
                  </div>
                </fieldset>
                <Checkbox name="notifyEmail" label="Send me email digests when email delivery is configured" defaultChecked={prefs.notifyEmail} />
                <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
              </form>
            </Card>
          ) : null}

          {tab === "privacy" ? (
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-navy-950">Privacy and visibility</h2>
                <form action={updatePrivacyAction} className="mt-3 space-y-4">
                  <Field
                    label="Who can message you"
                    htmlFor="allowDirectMessages"
                    hint="“Project members” restricts new direct messages to people who share an active project with you."
                  >
                    <Select id="allowDirectMessages" name="allowDirectMessages" defaultValue={prefs.allowDirectMessages}>
                      <option value="everyone">Anyone</option>
                      <option value="project_members">People I share a project with</option>
                      <option value="nobody">Nobody</option>
                    </Select>
                  </Field>
                  <fieldset className="space-y-1.5">
                    <legend className="field-label">Show on my public profile</legend>
                    <Checkbox name="showContributions" label="Contribution records" defaultChecked={prefs.profileVisibility.contributions} />
                    <Checkbox name="showLearning" label="Learning content I published" defaultChecked={prefs.profileVisibility.learning} />
                    <Checkbox name="showFollowers" label="Follower counts" defaultChecked={prefs.profileVisibility.followers} />
                    <Checkbox
                      name="shareLearningHistory"
                      label="Learning I completed"
                      description="Off by default. Only completed items are listed, and you can turn this off again at any time."
                      defaultChecked={prefs.shareLearningHistory}
                    />
                    <Checkbox name="showEmail" label="My email address (not recommended)" defaultChecked={prefs.showEmail} />
                  </fieldset>
                  <SubmitButton pendingLabel="Saving…">Save privacy settings</SubmitButton>
                </form>
              </Card>

              <Card>
                <div className="border-b border-navy-100 px-5 py-3.5">
                  <h2 className="text-[14px] font-semibold text-navy-950">Blocked accounts</h2>
                  <p className="text-[11px] text-navy-500">
                    Blocking hides their content from your feed and stops messages in both directions. They are not told.
                  </p>
                </div>
                <ul className="divide-y divide-navy-100">
                  {blocked.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={entry.displayName} size={26} />
                        <div>
                          <p className="text-[12px] font-medium text-navy-900">{entry.displayName}</p>
                          <p className="text-[10.5px] text-navy-500">@{entry.username}</p>
                        </div>
                      </div>
                      <form action={blockUserAction}>
                        <input type="hidden" name="userId" value={entry.id} />
                        <input type="hidden" name="unblock" value="true" />
                        <input type="hidden" name="returnTo" value="/settings?tab=privacy" />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          Unblock
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                  {blocked.length === 0 ? (
                    <li className="p-5">
                      <EmptyState title="Nobody blocked" description="You can block someone from their profile or a message." />
                    </li>
                  ) : null}
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-navy-950">Account restrictions</h2>
                <p className="mt-0.5 text-[12px] text-navy-600">
                  Status: <Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge>
                </p>
                {user.suspendedReason ? (
                  <p className="mt-1 text-[12px] text-red-700">Reason on record: {user.suspendedReason}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-navy-500">
                  If a restriction is wrong you can appeal through the{" "}
                  <Link href="/contact" className="underline">
                    contact form
                  </Link>
                  . Appeals are reviewed by a moderator and recorded in the audit log.
                </p>
              </Card>
            </div>
          ) : null}

          {tab === "preferences" ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Content preferences</h2>
              <p className="mt-0.5 text-[12px] text-navy-500">Used to rank your home feed and recommendations.</p>
              <form action={updateContentPrefsAction} className="mt-4 space-y-4">
                <fieldset>
                  <legend className="field-label">Categories I care about</legend>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {PROJECT_CATEGORIES.map((category) => (
                      <Checkbox
                        key={category}
                        name="categories"
                        value={category}
                        label={label(category)}
                        defaultChecked={(prefs.categories ?? []).includes(category)}
                      />
                    ))}
                  </div>
                </fieldset>
                <Field label="Other interests" htmlFor="interests" hint="Comma separated, e.g. accessibility, hardware, research.">
                  <Input id="interests" name="interests" defaultValue={(prefs.interests ?? []).join(", ")} />
                </Field>
                <Field label="Theme" htmlFor="theme" hint="Dark mode tokens exist in the design system; the dark theme is not shipped yet.">
                  <Select id="theme" name="theme" defaultValue={prefs.theme}>
                    <option value="system">Follow system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark (preview)</option>
                  </Select>
                </Field>
                <Checkbox name="reduceMotion" label="Reduce motion across the interface" defaultChecked={prefs.reduceMotion} />
                <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
              </form>
            </Card>
          ) : null}

          {tab === "contributions" ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3.5">
                <h2 className="text-[14px] font-semibold text-navy-950">My contribution records</h2>
                <p className="text-[11px] text-navy-500">
                  You can dispute a record you believe is inaccurate, and correct your own role description.
                </p>
              </div>
              <ul className="divide-y divide-navy-100">
                {attributions.map((row) => (
                  <li key={row.attribution.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-medium text-navy-900">{row.projectName}</span>
                      <Badge tone={row.attribution.status === "disputed" ? "danger" : "neutral"}>{row.attribution.status}</Badge>
                      <Badge tone="info">{row.attribution.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Verified"}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-navy-600">
                      {row.attribution.role}
                      {row.attribution.summary ? ` — ${row.attribution.summary}` : ""}
                    </p>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <form action={correctAttributionAction} className="space-y-1.5">
                        <input type="hidden" name="attributionId" value={row.attribution.id} />
                        <input type="hidden" name="returnTo" value="/settings?tab=contributions" />
                        <Input name="role" defaultValue={row.attribution.role} aria-label="Your role" className="h-8 text-[11.5px]" />
                        <Input name="summary" defaultValue={row.attribution.summary ?? ""} aria-label="Summary" className="h-8 text-[11.5px]" />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          Correct description
                        </SubmitButton>
                      </form>
                      <form action={disputeAttributionAction} className="space-y-1.5">
                        <input type="hidden" name="attributionId" value={row.attribution.id} />
                        <input type="hidden" name="returnTo" value="/settings?tab=contributions" />
                        <Input name="subject" placeholder="What is wrong?" aria-label="Dispute subject" className="h-8 text-[11.5px]" required />
                        <Input name="details" placeholder="Explain the inaccuracy" aria-label="Dispute details" className="h-8 text-[11.5px]" required />
                        <SubmitButton size="sm" variant="danger" pendingLabel="…">
                          Dispute record
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
                {attributions.length === 0 ? (
                  <li className="p-5">
                    <EmptyState title="No contribution records" description="Complete a task on a project to create one." />
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          {tab === "creator" ? (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-3.5">
                  <div>
                    <h2 className="text-[14px] font-semibold text-navy-950">Creator products</h2>
                    <p className="text-[11px] text-navy-500">
                      {sales.summaryLabel}
                    </p>
                  </div>
                  <ButtonLink href="/studio/products/new" size="sm">
                    New product
                  </ButtonLink>
                </div>
                <ul className="divide-y divide-navy-100">
                  {products.map((row) => (
                    <li key={row.product.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="text-[12.5px] font-medium text-navy-900">{row.product.title}</p>
                        <p className="text-[11px] text-navy-500">
                          {row.product.status} · {row.product.format.replace(/_/g, " ")}
                        </p>
                      </div>
                      <ButtonLink href={`/checkout/${row.product.id}`} size="sm" variant="secondary">
                        Manage access
                      </ButtonLink>
                    </li>
                  ))}
                  {products.length === 0 ? (
                    <li className="p-5">
                      <EmptyState title="No products yet" description="Package a learning path or workshop as a premium product." />
                    </li>
                  ) : null}
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-navy-950">Purchases</h2>
                <ul className="mt-2 space-y-2">
                  {purchases.map((row) => (
                    <li key={row.entitlement.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-navy-800">{row.product?.title ?? row.resource.title}</span>
                      <span className="text-[10.5px] text-navy-500">
                        {row.entitlement.expiresAt ? `access until ${formatDate(row.entitlement.expiresAt)}` : "access granted"}
                      </span>
                    </li>
                  ))}
                  {purchases.length === 0 ? <li className="text-[11.5px] text-navy-500">No learning purchases yet.</li> : null}
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="text-[14px] font-semibold text-navy-950">Businesses</h2>
                <ul className="mt-2 space-y-2">
                  {businesses.map((entry) => (
                    <li key={entry.business.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <Link href={`/business/${entry.business.id}`} className="text-navy-800 underline">
                        {entry.business.name}
                      </Link>
                      <span className="text-[10.5px] text-navy-500">{entry.role.replace(/_/g, " ")} · {entry.business.visibility}</span>
                    </li>
                  ))}
                  {businesses.length === 0 ? (
                    <li className="text-[11.5px] text-navy-500">
                      You do not manage a business account.{" "}
                      <Link href="/business" className="underline">
                        Create one
                      </Link>
                      .
                    </li>
                  ) : null}
                </ul>
              </Card>
            </div>
          ) : null}

          {tab === "account" ? (
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-navy-950">
                  <Download size={14} aria-hidden="true" /> Export your data
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-navy-600">
                  Download a JSON copy of your profile, preferences, skills, memberships, feedback and conversation memberships.
                  Files you uploaded are not included; download them from the records that reference them.
                </p>
                <a href="/api/account/export" className="btn-secondary mt-3 inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium">
                  Download export
                </a>
              </Card>

              <Card className="border-red-200 p-5">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-red-800">
                  <ShieldCheck size={14} aria-hidden="true" /> Delete account
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-navy-700">
                  Your personal details are scrubbed and sessions revoked. Contribution records remain attached to a “Deleted
                  account” actor so other people&apos;s project histories stay accurate. This cannot be undone.
                </p>
                <Divider />
                <form action={deleteAccountAction} className="space-y-2">
                  <Field label={`Type "${user.username}" to confirm`} htmlFor="confirmation">
                    <Input id="confirmation" name="confirmation" autoComplete="off" required />
                  </Field>
                  <SubmitButton variant="danger" pendingLabel="Deleting…" confirmMessage="Permanently delete your account and personal data?">
                    Delete my account
                  </SubmitButton>
                </form>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-200 bg-white p-3">
                <p className="text-[11px] text-navy-500">See something wrong with these settings?</p>
                <ReportForm targetType="user" targetId={user.id} returnTo="/settings?tab=account" />
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Account summary</h2>
            <DefinitionList
              items={[
                { term: "Email", value: user.email },
                { term: "Username", value: `@${user.username}` },
                { term: "Joined", value: formatDate(user.createdAt) },
                { term: "Status", value: user.status },
              ]}
            />
          </Card>
          <Alert tone="info" title="Server-side enforcement">
            Hiding a field in this UI does not hide the data. Visibility settings are applied in service-layer queries, so a
            direct API or page request returns the same result.
          </Alert>
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Related</h2>
            <ul className="mt-1.5 space-y-1 text-[11.5px]">
              <li>
                <Link href="/privacy" className="text-brand-700 underline">Privacy notice</Link>
              </li>
              <li>
                <Link href="/terms" className="text-brand-700 underline">Terms of use</Link>
              </li>
              <li>
                <Link href="/help" className="text-brand-700 underline">Help centre</Link>
              </li>
              <li>
                <Link href="/notifications" className="text-brand-700 underline">Notifications</Link>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
