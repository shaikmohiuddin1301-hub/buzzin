/**
 * First-boot demo seeding.
 *
 * The supported production deployment is a container with a persistent volume. On a brand
 * new volume the migrations create an empty database, so the public site has no projects, no
 * stories and no way to sign in. This entry point fills that gap exactly once.
 *
 * Seeding runs only when all of the following are true, and exits 0 without touching anything
 * otherwise (so it is safe to leave in the boot command on every restart):
 *
 *   1. `DEMO_MODE=1` — an explicit statement that this deployment is a demonstration.
 *   2. The database holds zero accounts. A database with any account is never wiped, even in
 *      demo mode; that is enforced again inside `seedDemoData`.
 *
 * `DEMO_RESET=1` is the one deliberate exception: it deletes the demo database and its uploads
 * before seeding, for the case where a stray account was created on a demonstration site and
 * blocks the seed. It is one-shot — a marker file beside the database records that it has run,
 * so leaving the variable set cannot erase data on a later restart. Remove it afterwards.
 *
 * Demonstration rows are fictional and labelled as such by the seed script. A deployment that
 * is not a demo sets no `DEMO_MODE` and starts with an honest empty state instead.
 */
import fs from "node:fs";
import path from "node:path";
import { databasePath } from "./client";
import { accountCount, seedDemoData } from "./seed";

function markerPath(): string {
  return path.join(path.dirname(databasePath()), ".demo-reset-done");
}

/** Delete the demo database and its uploads, once, when the operator explicitly asks. */
function resetDemoData(): boolean {
  if (process.env.DEMO_RESET !== "1") return false;
  if (fs.existsSync(markerPath())) {
    console.log("db:seed:first-boot: DEMO_RESET=1 was already applied to this volume; not resetting again.");
    return false;
  }

  console.warn(
    "DEMO_RESET=1: deleting this demonstration database and its uploaded media, then reseeding. " +
      "Any accounts created here will be lost.",
  );
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${databasePath()}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR?.trim() || "./storage");
  fs.rmSync(storageDir, { recursive: true, force: true });
  fs.mkdirSync(storageDir, { recursive: true });
  return true;
}

function recordReset(): void {
  fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
  fs.writeFileSync(markerPath(), `${new Date().toISOString()}\n`);
}

async function main() {
  if (process.env.DEMO_MODE !== "1") {
    console.log("db:seed:first-boot skipped: DEMO_MODE is not 1.");
    return;
  }

  const reset = resetDemoData();

  if (accountCount() > 0) {
    console.log("db:seed:first-boot skipped: this database already has accounts.");
    return;
  }

  console.log("db:seed:first-boot: empty database and DEMO_MODE=1, inserting demonstration data…");
  await seedDemoData();
  if (reset) recordReset();
}

main().catch((error) => {
  console.error("First-boot seed failed:", error);
  process.exitCode = 1;
});
