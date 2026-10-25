/**
 * First-boot demo seeding.
 *
 * The supported production deployment is a container with a persistent volume. On a brand
 * new volume the migrations create an empty database, so the public site has no projects, no
 * stories and no way to sign in — the demonstration data that makes the product legible is
 * missing. This entry point fills that gap exactly once.
 *
 * It runs only when all of the following are true, and exits 0 without touching anything
 * otherwise (so it is safe to leave in the boot command on every restart):
 *
 *   1. `DEMO_MODE=1` — an explicit statement that this deployment is a demonstration.
 *   2. The database holds zero accounts. A database with any account is never wiped, even in
 *      demo mode; that is enforced again inside `seedDemoData`.
 *
 * Demonstration rows are fictional and labelled as such by the seed script. A deployment that
 * is not a demo sets no `DEMO_MODE` and starts with an honest empty state instead.
 */
import { accountCount, seedDemoData } from "./seed";

async function main() {
  if (process.env.DEMO_MODE !== "1") {
    console.log("db:seed:first-boot skipped: DEMO_MODE is not 1.");
    return;
  }
  if (accountCount() > 0) {
    console.log("db:seed:first-boot skipped: this database already has accounts.");
    return;
  }
  console.log("db:seed:first-boot: empty database and DEMO_MODE=1, inserting demonstration data…");
  await seedDemoData();
}

main().catch((error) => {
  console.error("First-boot seed failed:", error);
  process.exitCode = 1;
});
