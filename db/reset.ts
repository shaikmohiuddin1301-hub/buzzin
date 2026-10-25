/** Drop the local database file and rebuild it from scratch. Development only. */
import fs from "node:fs";
import { databasePath } from "./client";

if (process.env.NODE_ENV === "production") {
  throw new Error("db:reset refuses to run in production.");
}

const file = databasePath();
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target);
}
console.log(`Removed ${file}. Run npm run db:migrate && npm run db:seed.`);
