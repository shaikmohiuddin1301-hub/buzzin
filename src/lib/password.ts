import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (memory-hard, in Node core so no native build is
 * required). Format: scrypt:N:r:p:saltHex:hashHex — parameters travel with the
 * hash so they can be raised later without invalidating existing accounts.
 */
const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

export const PASSWORD_MIN_LENGTH = 10;

export const COMMON_PASSWORDS = new Set([
  "password12",
  "password123",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou12",
  "buildtogether",
]);

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
  });
  return `scrypt:${PARAMS.N}:${PARAMS.r}:${PARAMS.p}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex!, "hex");
    const expected = Buffer.from(hashHex!, "hex");
    const derived = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time string comparison for tokens and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 200) return "Password must be 200 characters or fewer.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Choose something less predictable.";
  }
  if (/^(.)\1+$/.test(password)) return "Choose a less repetitive password.";
  return null;
}
