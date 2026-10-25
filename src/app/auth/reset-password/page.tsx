import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { readFlash } from "@/lib/actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error } = readFlash(params);
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Link missing</h1>
        <div className="mt-5">
          <Alert tone="warning">
            This page needs a reset token. Open the link from your email, or{" "}
            <Link href="/auth/forgot-password" className="underline">
              request a new one
            </Link>
            .
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-navy-600">Changing your password signs you out of every device.</p>

      {error ? (
        <div className="mt-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <form action={resetPasswordAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" htmlFor="password" required hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Updating…">
          Update password
        </SubmitButton>
      </form>
    </div>
  );
}
