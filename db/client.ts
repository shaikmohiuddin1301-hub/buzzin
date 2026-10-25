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

export type DatabaseFailureReason =
  | "read_only_filesystem"
  | "native_module_missing"
  | "cannot_open"
  | "unknown";

/**
 * Thrown when the database file cannot be opened at all.
 *
 * The message names the directory and the underlying code because it is only ever read from
 * server logs; callers must expose `reason`, never the message, to a browser.
 */
export class DatabaseUnavailableError extends Error {
  readonly reason: DatabaseFailureReason;

  constructor(reason: DatabaseFailureReason, message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.reason = reason;
  }
}

/** Map a filesystem or native-module error onto something an operator can act on. */
function classifyOpenFailure(error: unknown): DatabaseFailureReason {
  const err = error as NodeJS.ErrnoException;
  if (err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM") return "read_only_filesystem";
  if (err.code === "MODULE_NOT_FOUND" || /bindings file/i.test(err.message ?? "")) return "native_module_missing";
  if (typeof err.code === "string") return "cannot_open";
  return "unknown";
}

function openDatabase(file: string): Database.Database {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return new Database(file);
  } catch (error) {
    const reason = classifyOpenFailure(error);
    const detail = (error as Error).message;
    throw new DatabaseUnavailableError(
      reason,
      `The database at ${file} could not be opened (${reason}): ${detail}. ` +
        "SQLite needs a writable, persistent directory, which serverless platforms such as Netlify do not provide. " +
        "See docs/DEPLOYMENT.md.",
    );
  }
}

type Singleton = { sqlite: Database.Database; db: Db };

// A single connection per process keeps SQLite writes serialised and avoids
// repeatedly opening the file during hot reload in development.
const globalForDb = globalThis as unknown as { __buildtogetherDb?: Singleton };

export function getSqlite(): Database.Database {
  if (!globalForDb.__buildtogetherDb) {
    const sqlite = openDatabase(databasePath());
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
