import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Operational health: cheap, unauthenticated, and free of tenant data. */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  try {
    getDb().run(sql`select 1`);
  } catch {
    database = "error";
  }

  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      storage: env.storageDriver,
      narrationProvider: env.aiProvider,
      videoProvider: env.videoProvider,
      email: env.emailProvider,
      paymentsEnabled: env.paymentsEnabled,
      uptimeSeconds: Math.round(process.uptime()),
      checkMs: Date.now() - started,
    },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
