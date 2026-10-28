import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoAccounts, SignInForm } from "@/components/sign-in-form";
import { Alert } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/redirects";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const user = await getCurrentUser();
  // Never show the form to someone who already has a valid session.
  if (user) redirect(next);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-navy-600">Sign in to pick up your projects and learning.</p>

      <div className="mt-6 space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
      </div>

      <div className="mt-6">
        <SignInForm next={next} />
      </div>

      <p className="mt-6 text-sm text-navy-600">
        New here?{" "}
        <Link
          href={next === "/home" ? "/auth/sign-up" : `/auth/sign-up?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-600 hover:underline"
        >
          Create an account
        </Link>
      </p>

      <div className="mt-6">
        <DemoAccounts />
      </div>
    </div>
  );
}
