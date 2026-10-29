import Link from "next/link";
import { verifyEmailAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const user = await getCurrentUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>

      {token ? (
        <>
          <p className="mt-1.5 text-sm text-navy-600">
            Confirm this address to publish projects, learning content and premium products.
          </p>
          <form action={verifyEmailAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Verifying…">Verify my email address</SubmitButton>
          </form>
          <p className="mt-4 text-[12px] text-navy-500">
            We ask for a click rather than verifying on page load so that email link scanners cannot consume your token.
          </p>
        </>
      ) : user?.emailVerifiedAt ? (
        <div className="mt-5 space-y-4">
          <Alert tone="success">Your email address is already verified.</Alert>
          <ButtonLink href="/home">Go to your feed</ButtonLink>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {env.isProduction && env.emailProvider === "console" ? (
            <Alert tone="warning" title="Email delivery is not configured on this deployment">
              Your account exists, but verification messages are not sent. This deployment records them in the server log
              instead. Ask the site operator for your verification link, or sign in with a demonstration account.
            </Alert>
          ) : (
            <Alert tone="info">
              Open the verification link from your inbox. In this development build, emails are written to{" "}
              <code>data/outbox.log</code> and can be opened from the development outbox.
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {env.isProduction ? null : (
              <ButtonLink href="/auth/dev-outbox" variant="secondary" size="sm">
                Open development outbox
              </ButtonLink>
            )}
            <ButtonLink href="/settings?tab=security" variant="ghost" size="sm">
              Resend verification
            </ButtonLink>
          </div>
        </div>
      )}

      <p className="mt-6 text-sm text-navy-600">
        Need to sign in?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue-600 hover:underline">
          Go to sign in
        </Link>
      </p>
    </div>
  );
}
