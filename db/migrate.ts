/**
 * Minimal forward-only migration runner.
 *
 * Applies every `db/migrations/*.sql` file in lexical order inside a
 * transaction, recording applied names in `_migrations`. Safe to run repeatedly.
 */
import fs from "node:fs";
import path from "node:path";
import { getSqlite, databasePath } from "./client";

export function runMigrations(): string[] {
  const dir = path.join(process.cwd(), "db", "migrations");
  if (!fs.existsSync(dir)) throw new Error(`Migration directory not found: ${dir}`);

  const sqlite = getSqlite();
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);

  const applied = new Set(
    sqlite
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const freshlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const apply = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    });
    try {
      apply();
      freshlyApplied.push(file);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return freshlyApplied;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("db/migrate.ts")) {
  const applied = runMigrations();
  console.log(`Database: ${databasePath()}`);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
}
