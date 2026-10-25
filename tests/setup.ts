/**
 * Test bootstrap.
 *
 * Each run gets a throwaway SQLite file so tests never touch `data/buildtogether.db`.
 * `DATABASE_PATH` must be set before any module reads it, which is why this file
 * runs as a `setupFiles` entry rather than inside a test.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buildtogether-test-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.EMAIL_PROVIDER = "console";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = path.join(dir, "storage");
process.env.AI_PROVIDER = "local";
// Vitest already sets NODE_ENV=test; assigning it here trips the readonly type.

const { runMigrations } = await import("../db/migrate");
runMigrations();

const { resetRateLimits } = await import("@/lib/rate-limit");

// Rate limiting is tested explicitly; resetting between tests keeps unrelated
// cases from tripping shared buckets.
beforeEach(() => {
  resetRateLimits();
});

afterAll(() => {
  // Windows keeps the SQLite handle open until the process exits; cleanup is
  // best-effort so a locked file never fails an otherwise green run.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
