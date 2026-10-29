"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type Health = {
  status: string;
  database: "ok" | "error";
  databaseReason: string | null;
  schemaReady: boolean | null;
  configIssues?: string[];
};

const REASONS: Record<string, string> = {
  read_only_filesystem:
    "The application cannot write to its database directory. This build uses SQLite, which needs a persistent, writable disk — serverless hosts such as Netlify do not provide one.",
  native_module_missing:
    "The SQLite driver was not packaged for this deployment. Native modules must be installed and traced into the server build.",
  cannot_open: "The database file could not be opened.",
  schema_missing: "The database is reachable but has no tables. Migrations have not been applied.",
  query_failed: "The database did not answer a trivial query.",
  unknown: "The database could not be opened for an unknown reason.",
};

/**
 * Last-resort error screen.
 *
 * A failed database connection used to surface as "a server-side exception has occurred"
 * with only a digest, which tells neither the operator nor the visitor anything. This page
 * asks the health endpoint *why* and prints the configured reason, never a stack trace or a
 * file path.
 */
export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<Health>)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        /* the health route itself may be unreachable */
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const databaseDown = health?.database === "error" || health?.schemaReady === false;
  const detail = health?.databaseReason ? REASONS[health.databaseReason] : undefined;
  const configIssues = health?.configIssues ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-navy-600">BuildTogether</p>
        <h1 className="mt-3 text-2xl font-semibold text-navy-950">
          {databaseDown ? "This deployment cannot reach its database" : "Something went wrong"}
        </h1>
      </div>

      {configIssues.length > 0 ? (
        <div className="card-surface p-5">
          <p className="text-sm leading-6 text-navy-700">
            This deployment is missing configuration that the app needs in production:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy-700">
            {configIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-6 text-navy-700">
            Set these in the hosting provider&apos;s environment settings, then redeploy.
          </p>
        </div>
      ) : databaseDown && detail ? (
        <div className="card-surface p-5">
          <p className="text-sm leading-6 text-navy-700">{detail}</p>
          <p className="mt-3 text-sm leading-6 text-navy-700">
            Configuration is covered in <code className="rounded bg-navy-100 px-1.5 py-0.5 text-[13px]">docs/DEPLOYMENT.md</code>.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-navy-700">
          The request failed before it could be completed. Nothing you submitted was saved.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={reset} size="sm">
          Try again
        </Button>
        <a href="/api/health" className="text-sm text-blue-600 underline underline-offset-2">
          View service health
        </a>
      </div>

      {checked && health ? (
        <p className="text-xs text-navy-500">
          {health.database === "ok" ? "database ok" : `database ${health.databaseReason ?? "error"}`}
          {health.schemaReady === false ? " · schema missing" : ""}
        </p>
      ) : null}
    </main>
  );
}
