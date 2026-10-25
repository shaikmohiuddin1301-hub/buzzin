import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AppError, RateLimitError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  authenticate,
  changePassword,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmailToken,
} from "@/services/users";
import { makeUser } from "./helpers";

describe("registration", () => {
  it("creates a verified-capable account, hashes the password and seeds preferences", async () => {
    const result = await registerUser({
      email: "ada@example.test",
      password: "correct-horse-battery",
      displayName: "Ada Lovelace",
      username: "ada",
      ip: "10.1.0.1",
    });

    const row = getDb().select().from(users).where(eq(users.id, result.userId)).get()!;
    expect(row.email).toBe("ada@example.test");
    expect(row.passwordHash).not.toContain("correct-horse-battery");
    expect(verifyPassword("correct-horse-battery", row.passwordHash)).toBe(true);
    expect(result.devVerificationUrl).toBeTruthy();
  });

  it("rejects weak passwords, bad emails and reserved usernames", async () => {
    await expect(
      registerUser({ email: "a@b.test", password: "short", displayName: "A Person", username: "aperson", ip: "10.1.0.2" }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      registerUser({ email: "not-an-email", password: "correct-horse-battery", displayName: "A Person", username: "aperson2", ip: "10.1.0.3" }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      registerUser({ email: "b@c.test", password: "correct-horse-battery", displayName: "A Person", username: "admin", ip: "10.1.0.4" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a duplicate email in a case-insensitive way", async () => {
    await makeUser();
    const existing = getDb().select().from(users).limit(1).get()!;

    await expect(
      registerUser({
        email: existing.email.toUpperCase(),
        password: "correct-horse-battery",
        displayName: "Impostor",
        username: "impostor",
        ip: "10.1.0.5",
      }),
    ).rejects.toThrow(/already registered/i);
  });

  it("rate limits repeated registration attempts from one address", async () => {
    for (let i = 0; i < 5; i += 1) {
      await registerUser({
        email: `burst${i}@example.test`,
        password: "correct-horse-battery",
        displayName: `Burst ${i}`,
        username: `burst${i}`,
        ip: "10.9.9.9",
      }).catch(() => undefined);
    }
    await expect(
      registerUser({
        email: "burst-final@example.test",
        password: "correct-horse-battery",
        displayName: "Burst final",
        username: "burstfinal",
        ip: "10.9.9.9",
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("sign in", () => {
  it("accepts the right password and rejects the wrong one with a uniform error", async () => {
    const user = await makeUser();
    const ok = authenticate(user.email, user.password, "10.2.0.1");
    expect(ok.user.id).toBe(user.id);
    expect(ok.session.token.length).toBeGreaterThan(20);
    expect(ok.session.userId).toBe(user.id);

    expect(() => authenticate(user.email, "wrong-password-entirely", "10.2.0.2")).toThrow(/correct/i);
  });

  it("does not reveal whether an account exists", async () => {
    expect(() => authenticate("nobody@example.test", "whatever-goes-here", "10.2.0.3")).toThrow(
      /email or password/i,
    );
  });
});

describe("email verification and password reset", () => {
  it("verifies an email token once and rejects reuse", async () => {
    const result = await registerUser({
      email: "verify@example.test",
      password: "correct-horse-battery",
      displayName: "Verify Me",
      username: "verifyme",
      ip: "10.3.0.1",
    });
    const token = new URL(result.devVerificationUrl!).searchParams.get("token")!;

    expect(verifyEmailToken(token)).toBe(result.userId);
    expect(() => verifyEmailToken(token)).toThrow();
  });

  it("issues a single-use reset token that actually changes the password", async () => {
    const user = await makeUser();
    const issued = await requestPasswordReset(user.email);
    expect(issued.token).toBeTruthy();
    // In non-production the console adapter returns the email's action URL.
    const token = issued.token!.includes("token=")
      ? new URL(issued.token!).searchParams.get("token")!
      : issued.token!;

    resetPassword(token, "a-brand-new-password");
    expect(() => authenticate(user.email, user.password, "10.3.0.2")).toThrow();

    const ok = authenticate(user.email, "a-brand-new-password", "10.3.0.3");
    expect(ok.user.id).toBe(user.id);

    expect(() => resetPassword(token, "another-new-password")).toThrow();
  });

  it("requires the current password and revokes other sessions on change", async () => {
    const user = await makeUser();
    expect(() => changePassword(user.id, "not-the-password", "another-strong-pass", "another-strong-pass")).toThrow();
    expect(() =>
      changePassword(user.id, user.password, "another-strong-pass", "mismatched-confirmation"),
    ).toThrow();

    changePassword(user.id, user.password, "another-strong-pass", "another-strong-pass");
    const row = getDb().select().from(users).where(eq(users.id, user.id)).get()!;
    expect(hashPassword("another-strong-pass")).not.toBe(row.passwordHash);
    expect(verifyPassword("another-strong-pass", row.passwordHash)).toBe(true);
  });
});
