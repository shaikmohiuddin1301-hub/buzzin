import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error } = readFlash(params);
  const user = await getCurrentUser();
  if (user) redirect("/home");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-navy-600">
        One account for building, contributing, learning and teaching. You can hold more than one role.
      </p>

      {error ? (
        <div className="mt-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <form action={signUpAction} className="mt-6 space-y-4" noValidate>
        <Field label="Display name" htmlFor="displayName" required>
          <Input id="displayName" name="displayName" autoComplete="name" required placeholder="Ada Okonkwo" maxLength={60} />
        </Field>
        <Field
          label="Username"
          htmlFor="username"
          required
          hint="Lowercase letters, numbers, dots and underscores. Used in your profile URL."
        >
          <Input id="username" name="username" required placeholder="ada_builds" autoComplete="username" />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password" required hint="At least 10 characters. Avoid common passwords.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>

        <SubmitButton className="w-full" pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-navy-600">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>

      {env.showDevEmailLinks ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-3 py-2 text-[11px] leading-5 text-navy-500">
          Development mode: verification emails are written to the local outbox instead of being sent. You will be able to
          open the link from{" "}
          <Link href="/auth/dev-outbox" className="underline">
            the development outbox
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
