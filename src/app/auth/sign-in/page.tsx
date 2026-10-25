import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);
  const user = await getCurrentUser();
  if (user) redirect(user.onboardingCompletedAt ? "/home" : "/onboarding");

  const next = typeof params.next === "string" ? params.next : "";
  const demo = env.showDevEmailLinks || env.demoMode;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-navy-600">Sign in to pick up your projects and learning.</p>

      <div className="mt-6 space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
      </div>

      <form action={signInAction} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password" required hint="Never shared with project owners.">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex items-center justify-between">
          <Link href="/auth/forgot-password" className="text-[13px] font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <SubmitButton className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-6 text-sm text-navy-600">
        New here?{" "}
        <Link href="/auth/sign-up" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>

      {demo ? (
        <div className="mt-6 rounded-lg border border-navy-200 bg-navy-50 p-4 text-[12px] leading-6 text-navy-600">
          <p className="font-semibold text-navy-800">Demo accounts (seeded)</p>
          <p className="mt-1 font-mono text-[11px]">maya@example.test · jonas@example.test · sam@example.test</p>
          <p className="font-mono text-[11px]">Password: BuildTogether2026!</p>
          <p className="mt-1">
            These are fictional accounts from the demonstration dataset. Nothing here is a real person, testimonial or
            commercial result.
          </p>
        </div>
      ) : null}
    </div>
  );
}
