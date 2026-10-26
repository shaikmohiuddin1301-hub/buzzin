import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError, ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { signInPath } from "@/lib/redirects";
import { SESSION_COOKIE, resolveSession, revokeSession, type SessionUser } from "@/lib/session";

/** Per-request memoised current user. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const headerStore = await headers();
    const pathname = headerStore.get("x-pathname") ?? "/home";
    const search = headerStore.get("x-search") ?? "";
    // Keep the requested destination (path and query) so sign-in returns there.
    redirect(signInPath(`${pathname}${search}`));
  }
  return user;
}

/** For server actions/API routes: throw instead of redirecting. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (user.status === "suspended") throw new ForbiddenError("Your account is suspended. Contact support.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin && !user.isModerator) {
    redirect("/home?error=You%20do%20not%20have%20access%20to%20the%20administration%20area.");
  }
  return user;
}

export async function requireAdminOrThrow(): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (!user.isAdmin && !user.isModerator) throw new ForbiddenError("Administrator access required.");
  return user;
}

export function assertEmailVerified(user: SessionUser): void {
  if (!user.emailVerifiedAt) {
    throw new AppError(
      "Verify your email address before publishing. Check your inbox or resend the verification email from your profile.",
      { status: 403, code: "email_unverified" },
    );
  }
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) revokeSession(token);
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? undefined,
    userAgent: headerStore.get("user-agent") ?? undefined,
  };
}

/** Mark the account as seen at most every five minutes to avoid write churn. */
export function touchLastSeen(userId: string, lastSeenAt: string | null): void {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 300_000) return;
  getDb().update(users).set({ lastSeenAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
}

export async function signOut(): Promise<never> {
  await clearSessionCookie();
  redirect("/?notice=You%20have%20been%20signed%20out.");
}
