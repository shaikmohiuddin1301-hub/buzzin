/**
 * E2E database bootstrap.
 *
 * Runs before the app server, against the throwaway path supplied by
 * `playwright.config.ts`. The previous file is deleted first so every run starts
 * from the same seeded dataset and project names created by a test cannot leak
 * into the next one.
 *
 * `DATABASE_PATH` and `STORAGE_LOCAL_DIR` must already be set by the caller:
 * `db/client.ts` reads the environment when it is first imported, which is why
 * the database modules are imported dynamically below.
 */
import fs from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
  throw new Error("DATABASE_PATH must be set before preparing the E2E database.");
}

const dataDir = path.dirname(databasePath);
fs.mkdirSync(dataDir, { recursive: true });

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

const storageDir = process.env.STORAGE_LOCAL_DIR;
if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });

// A clean dev cache as well: this directory is never the developer's `.next`.
if (process.env.NEXT_DIST_DIR) {
  fs.rmSync(path.resolve(process.cwd(), process.env.NEXT_DIST_DIR), { recursive: true, force: true });
}

async function main() {
  const { runMigrations } = await import("../db/migrate");
  const { seedDemoData } = await import("../db/seed");

  runMigrations();
  await seedDemoData();

  console.log(`E2E database ready at ${databasePath}`);
}

main().catch((error) => {
  console.error("Could not prepare the E2E database:", error);
  process.exitCode = 1;
});
