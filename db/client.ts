import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  return path.resolve(process.cwd(), configured && configured.length > 0 ? configured : "./data/buildtogether.db");
}

type Singleton = { sqlite: Database.Database; db: Db };

// A single connection per process keeps SQLite writes serialised and avoids
// repeatedly opening the file during hot reload in development.
const globalForDb = globalThis as unknown as { __buildtogetherDb?: Singleton };

export function getSqlite(): Database.Database {
  if (!globalForDb.__buildtogetherDb) {
    const file = databasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = new Database(file);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    globalForDb.__buildtogetherDb = { sqlite, db: drizzle(sqlite, { schema }) };
  }
  return globalForDb.__buildtogetherDb.sqlite;
}

export function getDb(): Db {
  return getSqlite() ? globalForDb.__buildtogetherDb!.db : (null as never);
}

/** Run a multi-statement transaction. Nested calls reuse the open transaction. */
export function transaction<T>(fn: (db: Db) => T): T {
  const sqlite = getSqlite();
  if (sqlite.inTransaction) return fn(getDb());
  const wrapped = sqlite.transaction(() => fn(getDb()));
  return wrapped();
}

export { schema };
