import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { devVerifySelfAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Development outbox" };
export const dynamic = "force-dynamic";

type Entry = { at: string; to: string; subject: string; link?: string };

async function readOutbox(): Promise<Entry[]> {
  try {
    const file = path.resolve(process.cwd(), "data", "outbox.log");
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split("=".repeat(78))
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const line = (prefix: string) => block.split("\n").find((entry) => entry.startsWith(prefix))?.slice(prefix.length).trim();
        return {
          at: line("at:") ?? "",
          to: line("to:") ?? "",
          subject: line("subject:") ?? "",
          link: line("link:"),
        };
      })
      .reverse()
      .slice(0, 15);
  } catch {
    return [];
  }
}

export default async function DevOutboxPage() {
  if (env.isProduction) notFound();
  const entries = await readOutbox();
  const user = await getCurrentUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Development outbox</h1>
      <p className="mt-1.5 text-sm text-navy-600">
        No external email provider is configured, so messages are written to <code className="font-mono text-[12px]">data/outbox.log</code>.
        This page exists only outside production.
      </p>

      <div className="mt-5">
        <Alert tone="warning" title="Development only">
          Never expose verification or reset links like this in production. Set <code>EMAIL_PROVIDER</code> to a real
          transport before launch.
        </Alert>
      </div>

      {user ? (
        <form action={devVerifySelfAction} className="mt-4">
          <SubmitButton variant="secondary" size="sm" pendingLabel="Verifying…">
            Mark my account as verified (dev shortcut)
          </SubmitButton>
        </form>
      ) : null}

      <div className="mt-6 space-y-3">
        {entries.length === 0 ? (
          <Card className="p-5 text-sm text-navy-600">
            No messages yet. Sign up or request a password reset to generate one.
          </Card>
        ) : (
          entries.map((entry, index) => (
            <Card key={`${entry.at}-${index}`} className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-navy-500">{entry.at}</p>
              <p className="mt-1 text-sm font-semibold text-navy-900">{entry.subject}</p>
              <p className="text-[12px] text-navy-500">To: {entry.to}</p>
              {entry.link ? (
                <p className="mt-2 break-all">
                  <Link href={entry.link.replace(env.appUrl, "")} className="text-[12px] font-medium text-blue-600 underline">
                    {entry.link}
                  </Link>
                </p>
              ) : null}
            </Card>
          ))
        )}
      </div>

      <div className="mt-6">
        <ButtonLink href="/auth/sign-in" variant="ghost" size="sm">
          Back to sign in
        </ButtonLink>
      </div>
    </div>
  );
}
