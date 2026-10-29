import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { readFlash } from "@/lib/actions";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-navy-600">
        Enter the email on your account. If it exists, we will send a reset link that expires in one hour.
      </p>

      <div className="mt-5 space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? (
          <Alert tone="success">
            {notice}{" "}
            <Link href="/auth/dev-outbox" className="underline">
              Open the development outbox
            </Link>{" "}
            to find the link in this build.
          </Alert>
        ) : null}
      </div>

      <form action={forgotPasswordAction} className="mt-6 space-y-4">
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Sending…">
          Send reset link
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-navy-600">
        Remembered it?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
