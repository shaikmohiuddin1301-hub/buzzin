import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { DatabaseUnavailableError, databasePath, getDb, getSqlite } from "@/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Operational health: cheap, unauthenticated, and free of tenant data.
 *
 * `databaseReason` exists so a failing deployment can be diagnosed from the browser instead
 * of a generic "server-side exception" digest. It carries a fixed reason code, never a
 * message, a path or a stack trace.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let databaseReason: string | null = null;
  let schemaReady: boolean | null = null;
  let demoAccounts: number | null = null;

  try {
    getDb().run(sql`select 1`);
    const row = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get();
    schemaReady = Boolean(row);
    if (schemaReady && env.demoMode) {
      // Demo deployments only: distinguishes "first-boot seeding never ran" from "it ran and
      // this database already had accounts". A count, never an address or a name.
      demoAccounts = (getSqlite().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
    }
  } catch (error) {
    database = "error";
    databaseReason =
      error instanceof DatabaseUnavailableError
        ? error.reason
        : (error as Error).message?.includes("no such table")
          ? "schema_missing"
          : "query_failed";
  }

  const configIssues = env.configIssues;
  const healthy = database === "ok" && schemaReady !== false && configIssues.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      databaseReason,
      schemaReady,
      config: configIssues.length === 0 ? "ok" : "incomplete",
      configIssues,
      storage: env.storageDriver,
      narrationProvider: env.aiProvider,
      videoProvider: env.videoProvider,
      email: env.emailProvider,
      paymentsEnabled: env.paymentsEnabled,
      ...(env.demoMode
        ? {
            demoMode: true,
            demoAccounts,
            // `requested` is what this process was given; `applied` is whether the boot step
            // actually ran. Together they separate "the variable never reached the container"
            // from "the container's start command skips the seed step".
            demoReset: {
              requested: process.env.DEMO_RESET === "1",
              applied: fs.existsSync(path.join(path.dirname(databasePath()), ".demo-reset-done")),
            },
          }
        : {}),
      uptimeSeconds: Math.round(process.uptime()),
      checkMs: Date.now() - started,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
