import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, userRoles as userRolesTable, users } from "@/db/schema";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/password";
import type { UserGoal, UserRole } from "@/lib/types";

export const SESSION_COOKIE = "bt_session";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFileId: string | null;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  goals: UserGoal[];
  isAdmin: boolean;
  isModerator: boolean;
  status: "active" | "restricted" | "suspended" | "deleted";
  emailVerifiedAt: string | null;
  onboardingCompletedAt: string | null;
};

export type SessionRecord = {
  token: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
};

/** Create a session row. Only the SHA-256 of the token is stored server-side. */
export function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}): SessionRecord {
  const token = randomToken();
  const sessionId = sha256(token);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86_400_000).toISOString();

  getDb()
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    })
    .run();

  return { token, sessionId, userId, expiresAt };
}

export function revokeSession(token: string): void {
  getDb().delete(sessions).where(eq(sessions.id, sha256(token))).run();
}

export function revokeAllSessions(userId: string): void {
  getDb().delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function purgeExpiredSessions(): void {
  getDb().delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
}

/** Resolve a raw session token to a user, rejecting expired or disabled accounts. */
export function resolveSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const rows = db
    .select({
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1)
    .all();

  const row = rows[0];
  if (!row) return null;
  const user = row.user;
  if (user.status === "deleted" || user.status === "suspended") return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    avatarFileId: user.avatarFileId,
    bio: user.bio,
    location: user.location,
    timezone: user.timezone,
    goals: user.goals ?? [],
    isAdmin: user.isAdmin,
    isModerator: user.isModerator,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export function getUserRoles(userId: string): UserRole[] {
  return getDb()
    .select({ role: userRolesTable.role })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .all()
    .map((row) => row.role);
}
