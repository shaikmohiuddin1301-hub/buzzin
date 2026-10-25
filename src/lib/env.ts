/**
 * Typed environment access.
 *
 * Values are read lazily so tests can override them and so a missing optional
 * integration degrades to a local adapter instead of crashing the whole app.
 */
function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function num(name: string, fallback: number): number {
  const parsed = Number.parseInt(str(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = str(name).toLowerCase();
  if (value === "") return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export const env = {
  get appUrl() {
    return str("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  get sessionSecret() {
    const secret = str("SESSION_SECRET");
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET must be set in production. See .env.example.");
      }
      return "buildtogether-development-only-secret-do-not-use-in-production";
    }
    return secret;
  },
  get sessionTtlDays() {
    return num("SESSION_TTL_DAYS", 30);
  },
  get emailProvider() {
    return str("EMAIL_PROVIDER", "console") as "console" | "smtp";
  },
  get emailFrom() {
    return str("EMAIL_FROM", "BuildTogether <no-reply@buildtogether.example>");
  },
  get storageDriver() {
    return str("STORAGE_DRIVER", "local") as "local" | "s3";
  },
  get storageDir() {
    return str("STORAGE_LOCAL_DIR", "./storage");
  },
  get aiProvider() {
    return str("AI_PROVIDER", "local");
  },
  get videoProvider() {
    return str("VIDEO_PROVIDER", "local");
  },
  get paymentsEnabled() {
    // Payments are excluded from this build; this flag exists so the future
    // integration cannot be switched on accidentally.
    return false && bool("PAYMENTS_ENABLED", false);
  },
  get maxUploadMb() {
    return num("MAX_UPLOAD_MB", 10);
  },
  get allowedUploadTypes() {
    return str(
      "ALLOWED_UPLOAD_TYPES",
      "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/mpeg,audio/webm,video/mp4",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  },
  get rateLimits() {
    return {
      auth: num("RATE_LIMIT_AUTH_PER_MINUTE", 10),
      write: num("RATE_LIMIT_WRITE_PER_MINUTE", 60),
      ai: num("RATE_LIMIT_AI_PER_HOUR", 12),
    };
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  /**
   * A demonstration deployment: fictional seed data, and the demo sign-in details shown on the
   * sign-in page. Never a substitute for a real transport or a real user population.
   */
  get demoMode() {
    return bool("DEMO_MODE", false);
  },
  /** In non-production we surface verification/reset links instead of emailing. */
  get showDevEmailLinks() {
    return !this.isProduction && this.emailProvider === "console";
  },
  /**
   * Configuration problems that will break the running app.
   *
   * Names only — never values. `/api/health` exposes this so a broken deployment can be
   * diagnosed from the browser instead of from a bundler stack trace.
   */
  get configIssues(): string[] {
    const issues: string[] = [];
    if (this.isProduction) {
      if (!str("SESSION_SECRET")) issues.push("SESSION_SECRET is not set");
      if (!str("NEXT_PUBLIC_APP_URL")) issues.push("NEXT_PUBLIC_APP_URL is not set");
    }
    if (this.storageDriver === "s3") {
      issues.push("STORAGE_DRIVER=s3 is documented but not implemented; use local storage on a persistent volume");
    }
    if (this.emailProvider === "smtp") {
      issues.push("EMAIL_PROVIDER=smtp is documented but not implemented; verification links go to the console outbox");
    }
    return issues;
  },
};
