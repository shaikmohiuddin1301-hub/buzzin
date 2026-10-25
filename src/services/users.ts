import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  authTokens,
  blockedUsers,
  conversationMembers,
  follows,
  learnerFeedback,
  projectMembers,
  skills,
  userPreferences,
  userRoles,
  userSkills,
  users,
} from "@/db/schema";
import { AppError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "@/lib/password";
import { createSession, revokeAllSessions } from "@/lib/session";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import type { UserGoal, UserRole } from "@/lib/types";

const USERNAME_RE = /^[a-z0-9_](?:[a-z0-9_.-]{1,28}[a-z0-9_])?$/;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new AppError(
      "Usernames are 3–30 characters, lowercase letters, numbers, dots, dashes or underscores, and must start and end with a letter, number or underscore.",
      { fields: { username: "Invalid username format." } },
    );
  }
  if (["admin", "support", "buildtogether", "api", "settings", "help"].includes(username)) {
    throw new AppError("That username is reserved.", { fields: { username: "Reserved username." } });
  }
  return username;
}

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  username: string;
  roles?: UserRole[];
  ip?: string;
};

export async function registerUser(input: RegisterInput) {
  const db = getDb();
  const email = normaliseEmail(input.email);
  const username = validateUsername(input.username);
  const displayName = input.displayName.trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError("Enter a valid email address.", { fields: { email: "Invalid email." } });
  }
  if (displayName.length < 2 || displayName.length > 60) {
    throw new AppError("Display name must be 2–60 characters.", { fields: { displayName: "Invalid name." } });
  }
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem, { fields: { password: problem } });

  rateLimit(`register:${input.ip ?? "unknown"}`, 5, 60_000);

  const existing = db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .get();
  if (existing) {
    const field = existing.email === email ? "email" : "username";
    throw new AppError(`That ${field} is already registered.`, { status: 409, code: "duplicate", fields: { [field]: "Already in use." } });
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const roles = (input.roles?.length ? input.roles : ["learner", "contributor"]) as UserRole[];

  transaction((tx) => {
    tx.insert(users)
      .values({
        id: userId,
        email,
        username,
        displayName,
        passwordHash: hashPassword(input.password),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    for (const role of new Set(roles)) tx.insert(userRoles).values({ userId, role }).run();
    tx.insert(userPreferences).values({ userId }).run();
  });

  const token = randomToken(24);
  db.insert(authTokens)
    .values({
      id: sha256(token),
      userId,
      kind: "verify_email",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .run();

  const emailResult = await sendVerificationEmail(email, token);

  return {
    userId,
    username,
    // Only surfaced outside production with the console email adapter.
    devVerificationUrl: env.showDevEmailLinks ? emailResult.previewUrl : undefined,
  };
}

export function authenticate(email: string, password: string, ip?: string) {
  const db = getDb();
  const normalised = normaliseEmail(email);
  rateLimit(`login:${ip ?? "unknown"}:${normalised}`, env.rateLimits.auth, 60_000);

  const user = db.select().from(users).where(eq(users.email, normalised)).get();
  // Uniform failure message prevents account enumeration.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new UnauthorizedError("Email or password is incorrect.");
  }
  if (user.status === "suspended") {
    throw new UnauthorizedError("This account is suspended. Contact support to appeal.");
  }
  if (user.status === "deleted") throw new UnauthorizedError("Email or password is incorrect.");

  const session = createSession(user.id, { ip });
  db.update(users).set({ lastSeenAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
  return { user, session };
}

export function verifyEmailToken(token: string): string {
  const db = getDb();
  const id = sha256(token);
  const record = db.select().from(authTokens).where(and(eq(authTokens.id, id), eq(authTokens.kind, "verify_email"))).get();
  if (!record || record.usedAt || record.expiresAt < new Date().toISOString()) {
    throw new AppError("That verification link is invalid or has expired.", { status: 400 });
  }
  db.update(authTokens).set({ usedAt: new Date().toISOString() }).where(eq(authTokens.id, id)).run();
  db.update(users).set({ emailVerifiedAt: new Date().toISOString() }).where(eq(users.id, record.userId)).run();
  return record.userId;
}

export function resendVerification(userId: string): { token?: string } {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new NotFoundError("Account not found.");
  if (user.emailVerifiedAt) throw new AppError("Your email is already verified.");
  rateLimit(`verify-resend:${userId}`, 3, 600_000);

  const token = randomToken(24);
  db.insert(authTokens)
    .values({
      id: sha256(token),
      userId,
      kind: "verify_email",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .run();
  return { token };
}

export async function requestPasswordReset(email: string): Promise<{ token?: string }> {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, normaliseEmail(email))).get();
  rateLimit(`reset:${normaliseEmail(email)}`, 3, 600_000);
  // Always report success so the endpoint cannot be used to enumerate accounts.
  if (!user) return {};

  const token = randomToken(24);
  db.insert(authTokens)
    .values({
      id: sha256(token),
      userId: user.id,
      kind: "reset_password",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    .run();
  const result = await sendPasswordResetEmail(user.email, token);
  return { token: env.showDevEmailLinks ? (result.previewUrl ?? token) : undefined };
}

export function resetPassword(token: string, newPassword: string): void {
  const db = getDb();
  const problem = passwordProblem(newPassword);
  if (problem) throw new AppError(problem);

  const id = sha256(token);
  const record = db.select().from(authTokens).where(and(eq(authTokens.id, id), eq(authTokens.kind, "reset_password"))).get();
  if (!record || record.usedAt || record.expiresAt < new Date().toISOString()) {
    throw new AppError("That reset link is invalid or has expired.", { status: 400 });
  }

  transaction((tx) => {
    tx.update(users)
      .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() })
      .where(eq(users.id, record.userId))
      .run();
    tx.update(authTokens).set({ usedAt: new Date().toISOString() }).where(eq(authTokens.id, id)).run();
  });
  // Any stolen session is invalidated when the password changes.
  revokeAllSessions(record.userId);
}

export function changePassword(userId: string, currentPassword: string, newPassword: string, confirmPassword: string): void {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new NotFoundError("Account not found.");
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AppError("Your current password is incorrect.", { fields: { currentPassword: "Incorrect password." } });
  }
  if (newPassword !== confirmPassword) throw new AppError("The two new passwords do not match.");
  const problem = passwordProblem(newPassword);
  if (problem) throw new AppError(problem);
  if (verifyPassword(newPassword, user.passwordHash)) throw new AppError("Choose a password you have not used here before.");

  db.update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
  // Every existing session is invalidated; the user signs in again.
  revokeAllSessions(userId);
}

export type OnboardingInput = {
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  timezone?: string;
  skills: string[];
  interests: string[];
  goals: UserGoal[];
  categories: string[];
  portfolioUrls: string[];
  roles: UserRole[];
  avatarFileId?: string | null;
};

export function completeOnboarding(userId: string, input: OnboardingInput): void {
  const db = getDb();
  const username = validateUsername(input.username);

  const taken = db.select({ id: users.id }).from(users).where(and(eq(users.username, username), ne(users.id, userId))).get();
  if (taken) throw new AppError("That username is already taken.", { fields: { username: "Taken." } });

  transaction((tx) => {
    tx.update(users)
      .set({
        displayName: input.displayName.trim().slice(0, 60),
        username,
        bio: input.bio?.slice(0, 600) ?? null,
        location: input.location?.slice(0, 80) ?? null,
        timezone: input.timezone?.slice(0, 60) ?? null,
        goals: input.goals,
        portfolioUrls: input.portfolioUrls.filter(Boolean).slice(0, 5),
        avatarFileId: input.avatarFileId ?? null,
        onboardingCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .run();

    for (const role of new Set(input.roles)) {
      tx.insert(userRoles).values({ userId, role }).onConflictDoNothing().run();
    }

    tx.update(userPreferences)
      .set({ interests: input.interests, categories: input.categories })
      .where(eq(userPreferences.userId, userId))
      .run();

    for (const name of input.skills.slice(0, 20)) {
      const skill = upsertSkill(name);
      if (!skill) continue;
      tx.insert(userSkills).values({ userId, skillId: skill.id }).onConflictDoNothing().run();
    }
  });
}

export function upsertSkill(name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const slug = slugify(clean);
  if (!slug) return null;
  const db = getDb();
  const existing = db.select().from(skills).where(eq(skills.slug, slug)).get();
  if (existing) return existing;
  const row = { id: randomUUID(), name: clean, slug, createdAt: new Date().toISOString() };
  db.insert(skills).values(row).run();
  return row;
}

export function listSkills(query?: string) {
  const db = getDb();
  const base = db
    .select({
      id: skills.id,
      name: skills.name,
      slug: skills.slug,
      category: skills.category,
      people: sql<number>`(select count(*) from user_skills us where us.skill_id = ${skills.id})`,
      projects: sql<number>`(select count(*) from project_skills ps where ps.skill_id = ${skills.id})`,
    })
    .from(skills);
  return query
    ? base.where(like(skills.name, `%${query}%`)).orderBy(asc(skills.name)).limit(60).all()
    : base.orderBy(asc(skills.name)).limit(60).all();
}

export function getUserByUsername(username: string) {
  return getDb().select().from(users).where(eq(users.username, username.toLowerCase())).get() ?? null;
}

export function getUserById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get() ?? null;
}

export function getPreferences(userId: string) {
  return getDb().select().from(userPreferences).where(eq(userPreferences.userId, userId)).get() ?? null;
}

export function getUserRolesList(userId: string): UserRole[] {
  return getDb().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)).all().map((r) => r.role);
}

export function userSkillsFor(userId: string) {
  return getDb()
    .select({ id: skills.id, name: skills.name, slug: skills.slug, level: userSkills.level, evidence: userSkills.evidenceCount })
    .from(userSkills)
    .innerJoin(skills, eq(skills.id, userSkills.skillId))
    .where(eq(userSkills.userId, userId))
    .all();
}

export function updateProfile(
  userId: string,
  input: { displayName: string; bio?: string; location?: string; timezone?: string; portfolioUrls?: string[]; avatarFileId?: string | null },
): void {
  getDb()
    .update(users)
    .set({
      displayName: input.displayName.trim().slice(0, 60),
      bio: input.bio?.slice(0, 600) ?? null,
      location: input.location?.slice(0, 80) ?? null,
      timezone: input.timezone?.slice(0, 60) ?? null,
      portfolioUrls: (input.portfolioUrls ?? []).filter(Boolean).slice(0, 5),
      ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();
}

export function updateSkills(userId: string, skillNames: string[]): void {
  transaction((tx) => {
    tx.delete(userSkills).where(eq(userSkills.userId, userId)).run();
    for (const name of skillNames.slice(0, 20)) {
      const skill = upsertSkill(name);
      if (skill) tx.insert(userSkills).values({ userId, skillId: skill.id }).onConflictDoNothing().run();
    }
  });
}

export function updatePreferences(
  userId: string,
  input: {
    categories?: string[];
    interests?: string[];
    allowDirectMessages?: "everyone" | "project_members" | "nobody";
    profileVisibility?: { contributions: boolean; learning: boolean; followers: boolean };
    notifyMatrix?: Record<string, boolean>;
    notifyEmail?: boolean;
    showEmail?: boolean;
    reduceMotion?: boolean;
    theme?: "light" | "dark" | "system";
  },
): void {
  getDb()
    .update(userPreferences)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(userPreferences.userId, userId))
    .run();
}

export function followUser(followerId: string, followeeId: string): void {
  if (followerId === followeeId) throw new AppError("You cannot follow yourself.");
  const target = getUserById(followeeId);
  if (!target) throw new NotFoundError("Person not found.");
  const db = getDb();
  const existing = db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId))).get();
  if (existing) {
    db.delete(follows).where(eq(follows.id, existing.id)).run();
    return;
  }
  db.insert(follows).values({ followerId, followeeId }).run();
  notify({
    userId: followeeId,
    actorId: followerId,
    kind: "new_follower",
    title: "You have a new follower",
    href: `/u/${getUserById(followerId)?.username ?? ""}`,
  });
}

export function isFollowing(followerId: string, followeeId: string): boolean {
  return !!getDb()
    .select({ id: follows.id })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .get();
}

export function followerCounts(userId: string) {
  const db = getDb();
  return {
    followers: db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followeeId, userId)).get()?.count ?? 0,
    following: db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId)).get()?.count ?? 0,
  };
}

export function listFollowers(userId: string) {
  return getDb()
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId, bio: users.bio })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerId))
    .where(eq(follows.followeeId, userId))
    .orderBy(desc(follows.createdAt))
    .all();
}

export function listFollowing(userId: string) {
  return getDb()
    .select({ id: users.id, username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId, bio: users.bio })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt))
    .all();
}

export function blockUser(blockerId: string, blockedId: string, reason?: string): void {
  if (blockerId === blockedId) throw new AppError("You cannot block yourself.");
  const db = getDb();
  db.insert(blockedUsers).values({ blockerId, blockedId }).onConflictDoNothing().run();
  db.delete(follows).where(and(eq(follows.followerId, blockedId), eq(follows.followeeId, blockerId))).run();
  notify({ userId: blockedId, kind: "system", title: "A user restricted interaction with you", body: reason ?? undefined });
}

export function unblockUser(blockerId: string, blockedId: string): void {
  getDb().delete(blockedUsers).where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId))).run();
}

export function listBlocked(userId: string) {
  return getDb()
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(blockedUsers)
    .innerJoin(users, eq(users.id, blockedUsers.blockedId))
    .where(eq(blockedUsers.blockerId, userId))
    .all();
}

/** Personal data export (UK GDPR data subject access). */
export function exportUserData(userId: string) {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) throw new NotFoundError("Account not found.");
  const { passwordHash, ...profile } = user;
  return {
    exportedAt: new Date().toISOString(),
    profile,
    roles: getUserRolesList(userId),
    preferences: getPreferences(userId),
    skills: userSkillsFor(userId),
    following: listFollowing(userId).map((p) => p.username),
    followers: listFollowers(userId).map((p) => p.username),
    feedbackGiven: db.select().from(learnerFeedback).where(eq(learnerFeedback.userId, userId)).all(),
    projectMemberships: db.select().from(projectMembers).where(eq(projectMembers.userId, userId)).all(),
    conversations: db.select().from(conversationMembers).where(eq(conversationMembers.userId, userId)).all(),
  };
}

/**
 * Account deletion.
 *
 * Personal identifiers are irreversibly scrubbed and all sessions revoked.
 * Contributions stay attached to a "Deleted account" actor because project
 * histories and other people's attribution records must remain accurate.
 */
export function deleteAccount(userId: string, confirmation: string): void {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) throw new NotFoundError("Account not found.");
  if (confirmation.trim().toLowerCase() !== user.username) {
    throw new AppError("Type your username exactly to confirm deletion.");
  }

  transaction((tx) => {
    tx.update(users)
      .set({
        email: `deleted+${userId}@buildtogether.invalid`,
        passwordHash: "deleted",
        displayName: "Deleted account",
        username: `deleted_${userId.slice(0, 8)}`,
        bio: null,
        location: null,
        portfolioUrls: [],
        goals: [],
        avatarFileId: null,
        status: "deleted",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .run();
    tx.delete(authTokens).where(eq(authTokens.userId, userId)).run();
    tx.delete(userSkills).where(eq(userSkills.userId, userId)).run();
    tx.delete(follows).where(or(eq(follows.followerId, userId), eq(follows.followeeId, userId))).run();
    tx.delete(blockedUsers).where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId))).run();
    tx.delete(userPreferences).where(eq(userPreferences.userId, userId)).run();
    tx.update(conversationMembers).set({ removedAt: new Date().toISOString() }).where(eq(conversationMembers.userId, userId)).run();
  });
  revokeAllSessions(userId);
}

export function searchPeople(query: string, limit = 24) {
  const db = getDb();
  const trimmed = query.trim();
  const conditions = [eq(users.status, "active"), ne(users.username, "")];
  if (trimmed) {
    conditions.push(
      or(like(users.displayName, `%${trimmed}%`), like(users.username, `%${trimmed}%`), like(users.bio, `%${trimmed}%`))!,
    );
  }

  const rows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
      bio: users.bio,
      location: users.location,
      goals: users.goals,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.lastSeenAt))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    ...row,
    skills: userSkillsFor(row.id).slice(0, 3),
  }));
}
