"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authTokens, users } from "@/db/schema";
import { runServerAction } from "@/lib/actions";
import { clearSessionCookie, requestMeta, requireUserOrThrow, setSessionCookie, getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { bool, file, list, str } from "@/lib/form";
import { safeNextPath, withNext } from "@/lib/redirects";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import {
  authenticate,
  completeOnboarding,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmailToken,
} from "@/services/users";
import type { UserGoal, UserRole } from "@/lib/types";

export async function signUpAction(formData: FormData) {
  const next = safeNextPath(str(formData, "next") || null);
  // Keep the intended destination through a failed registration attempt too.
  const fallback = withNext("/auth/sign-up", next);

  await runServerAction(fallback, async () => {
    const meta = await requestMeta();
    const result = await registerUser({
      email: str(formData, "email"),
      password: str(formData, "password"),
      displayName: str(formData, "displayName"),
      username: str(formData, "username"),
      ip: meta.ip,
    });

    const session = createSession(result.userId, meta);
    await setSessionCookie(session.token, session.expiresAt);
    // The account is now authenticated. Go where the visitor was heading, or Home.
    const destination =
      next === "/home" ? "/home?notice=Your%20account%20is%20ready.%20Add%20goals%20and%20skills%20when%20you%20like." : next;
    return { path: destination, revalidate: ["/home"] };
  });
}

export async function signInAction(formData: FormData) {
  const next = safeNextPath(str(formData, "next") || null);
  const fallback = withNext("/auth/sign-in", next);

  await runServerAction(fallback, async () => {
    const meta = await requestMeta();
    const { session } = authenticate(str(formData, "email"), str(formData, "password"), meta.ip);
    await setSessionCookie(session.token, session.expiresAt);
    // Only redirect once the session cookie has been set: the destination, or Home.
    return { path: next, revalidate: ["/home"] };
  });
}

export async function signOutAction() {
  await clearSessionCookie();
  redirect("/?notice=You%20have%20been%20signed%20out.");
}

export async function resendVerificationAction() {
  await runServerAction("/settings?tab=security", async () => {
    const user = await requireUserOrThrow();
    const { token } = resendVerification(user.id);
    if (token) void token; // the link is written to the development outbox
    return { path: "/settings?tab=security", revalidate: ["/settings"] };
  });
}

export async function verifyEmailAction(formData: FormData) {
  await runServerAction("/auth/sign-in", async () => {
    const token = str(formData, "token");
    if (!token) throw new AppError("This verification link is missing its token.");
    verifyEmailToken(token);
    return { path: "/home?notice=Your%20email%20is%20verified.", revalidate: ["/home"] };
  });
}

export async function forgotPasswordAction(formData: FormData) {
  await runServerAction("/auth/forgot-password", async () => {
    const email = str(formData, "email");
    rateLimit(`forgot:${email}`, 5, 600_000);
    await requestPasswordReset(email);
    return {
      path: "/auth/forgot-password?notice=If%20that%20address%20has%20an%20account%2C%20a%20reset%20link%20is%20on%20its%20way.",
    };
  });
}

export async function resetPasswordAction(formData: FormData) {
  await runServerAction("/auth/reset-password", async () => {
    const token = str(formData, "token");
    const password = str(formData, "password");
    const confirm = str(formData, "confirmPassword");
    if (password !== confirm) throw new AppError("The two passwords do not match.");
    resetPassword(token, password);
    return { path: "/auth/sign-in?notice=Password%20updated.%20Sign%20in%20with%20your%20new%20password." };
  });
}

export async function onboardingAction(formData: FormData) {
  const next = safeNextPath(str(formData, "next") || null);
  await runServerAction(withNext("/onboarding", next), async () => {
    const user = await requireUserOrThrow();
    const goals = list(formData, "goals") as UserGoal[];

    const avatar = file(formData, "avatar");
    let avatarFileId: string | null = null;
    if (avatar) {
      const { saveUploadedFile } = await import("@/lib/storage");
      const file = await saveUploadedFile(avatar, { ownerId: user.id, visibility: "public" });
      avatarFileId = file.id;
    }
    const roles = list(formData, "roles") as UserRole[];
    if (goals.length === 0) throw new AppError("Choose at least one goal so we can shape your feed.");

    completeOnboarding(user.id, {
      displayName: str(formData, "displayName", user.displayName),
      username: str(formData, "username", user.username),
      bio: str(formData, "bio") || undefined,
      location: str(formData, "location") || undefined,
      timezone: str(formData, "timezone") || undefined,
      skills: list(formData, "skills"),
      interests: list(formData, "interests"),
      goals,
      categories: list(formData, "categories"),
      portfolioUrls: list(formData, "portfolioUrls", 5),
      roles: roles.length ? roles : ["learner"],
      avatarFileId,
    });

    return {
      path: withNext("/home?notice=Your%20profile%20is%20ready.", next),
      revalidate: ["/home", "/explore"],
    };
  });
}

/** Dev-only helper: mark the signed-in account verified (used by the outbox page). */
export async function devVerifySelfAction() {
  await runServerAction("/home", async () => {
    if (process.env.NODE_ENV === "production") throw new AppError("Not available in production.");
    const user = await getCurrentUser();
    if (!user) redirect("/auth/sign-in");
    getDb().update(users).set({ emailVerifiedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
    getDb().delete(authTokens).where(eq(authTokens.userId, user.id)).run();
    return { path: "/home?notice=Email%20marked%20verified%20(development%20shortcut).", revalidate: ["/home"] };
  });
}
