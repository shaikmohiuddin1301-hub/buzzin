import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { DemoAccounts, SignInForm } from "@/components/sign-in-form";
import { Alert, ButtonLink } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Sign in",
  // The marketing landing page lives at /welcome; keep the app gate out of search results.
  robots: { index: false, follow: true },
};

/**
 * The application entry point.
 *
 * Authentication is resolved from the server-side session cookie, never from a
 * client flag or local storage. A signed-in visitor is sent straight to Home; a
 * visitor without a session gets the Login / Sign Up screen. The full marketing
 * landing page is preserved separately at /welcome.
 */
export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  const params = await searchParams;
  const { error, notice } = readFlash(params);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">Welcome to BuildTogether</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to keep building</h1>
      <p className="mt-2 text-sm leading-6 text-navy-600">
        Your projects, chats, learning and contribution record, in one place.
      </p>

      <div className="mt-6 space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
      </div>

      <div className="mt-6">
        <SignInForm next="/home" />
      </div>

      <div className="mt-6 rounded-xl border border-navy-200 bg-surface p-4">
        <p className="text-[13px] font-semibold text-navy-950">New to BuildTogether?</p>
        <p className="mt-1 text-[12px] leading-5 text-navy-600">
          Create a free account to start a project, contribute to one, or learn from work that is already documented.
        </p>
        <ButtonLink href="/auth/sign-up" variant="secondary" className="mt-3 w-full">
          Create account
        </ButtonLink>
      </div>

      <p className="mt-6 text-center text-[12px] leading-5 text-navy-500">
        Not ready to join?{" "}
        <Link href="/welcome" className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
          Explore BuildTogether
          <ArrowUpRight size={12} aria-hidden="true" />
        </Link>{" "}
        or{" "}
        <Link href="/courses" className="font-medium text-brand-700 hover:underline">
          browse public courses
        </Link>
        .
      </p>

      <div className="mt-6">
        <DemoAccounts />
      </div>
    </div>
  );
}
