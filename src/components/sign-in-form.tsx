import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client/submit-button";
import { Field, Input } from "@/components/ui";
import { env } from "@/lib/env";

/**
 * The one sign-in form used by the app entry screen and /auth/sign-in.
 *
 * `next` is only a convenience field: the server action re-validates it with
 * `safeNextPath` before redirecting, so a tampered value cannot leave the app.
 */
export function SignInForm({ next = "/home" }: { next?: string }) {
  return (
    <form action={signInAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password" htmlFor="password" required hint="Never shared with project owners.">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/auth/forgot-password" className="text-[13px] font-medium text-blue-600 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

/** Demo credentials, shown only when a demonstration dataset is actually loaded. */
export function DemoAccounts() {
  if (!env.showDevEmailLinks && !env.demoMode) return null;

  return (
    <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-[12px] leading-6 text-navy-600">
      <p className="font-semibold text-navy-800">Demo accounts (seeded)</p>
      <p className="mt-1 font-mono text-[11px]">maya@example.test · jonas@example.test · sam@example.test</p>
      <p className="font-mono text-[11px]">Password: BuildTogether2026!</p>
      <p className="mt-1">
        These are fictional accounts from the demonstration dataset. Nothing here is a real person, testimonial or
        commercial result.
      </p>
    </div>
  );
}
