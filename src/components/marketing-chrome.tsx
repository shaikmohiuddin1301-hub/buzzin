import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const primaryLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/courses", label: "Courses" },
  { href: "/for-creators", label: "For creators" },
  { href: "/for-businesses", label: "For businesses" },
  { href: "/for-learners", label: "For learners" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader({ signedIn, username }: { signedIn: boolean; username?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-200/70 glass">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo href="/welcome" />

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-navy-600 hover:bg-navy-50 hover:text-navy-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <>
              <ButtonLink href="/home" variant="secondary" size="sm">
                Go to app
              </ButtonLink>
              <ButtonLink href={`/u/${username}`} size="sm">
                Your profile
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/auth/sign-in" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/auth/sign-up" size="sm">
                Join BuildTogether
              </ButtonLink>
            </>
          )}
        </div>

        {/* Mobile menu without client JS */}
        <details className="group relative ml-auto md:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-navy-200 text-navy-700 [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Open menu</span>
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="absolute right-0 top-12 w-64 rounded-xl border border-navy-200 bg-surface p-2 shadow-raised">
            <nav aria-label="Mobile primary">
              <ul>
                {primaryLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="block rounded-md px-3 py-2 text-sm text-navy-700 hover:bg-navy-50">
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/help" className="block rounded-md px-3 py-2 text-sm text-navy-700 hover:bg-navy-50">
                    Help centre
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="mt-2 border-t border-navy-200 pt-2">
              {signedIn ? (
                <ButtonLink href="/home" size="sm" className="w-full">
                  Go to app
                </ButtonLink>
              ) : (
                <div className="space-y-2">
                  <ButtonLink href="/auth/sign-up" size="sm" className="w-full">
                    Join BuildTogether
                  </ButtonLink>
                  <ButtonLink href="/auth/sign-in" variant="secondary" size="sm" className="w-full">
                    Sign in
                  </ButtonLink>
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "/welcome", label: "Welcome" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/explore", label: "Explore projects" },
      { href: "/courses", label: "Courses" },
      { href: "/learn", label: "Learning centre" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Audiences",
    links: [
      { href: "/for-creators", label: "For creators" },
      { href: "/for-businesses", label: "For businesses" },
      { href: "/for-learners", label: "For learners" },
      { href: "/challenges", label: "Challenges" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/help", label: "Help centre" },
      { href: "/community-guidelines", label: "Community guidelines" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy notice" },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy#rights", label: "Your data rights" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-navy-200 bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo href="/welcome" />
            <p className="mt-3 max-w-xs text-[13px] leading-6 text-navy-500">
              Build real things, document the work, teach what you learn, and grow a reputation from evidence rather than
              follower counts.
            </p>
          </div>
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">{group.title}</h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[13px] text-navy-600 hover:text-navy-950 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-navy-200 pt-6 text-[12px] text-navy-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BuildTogether. A demonstration platform built for review.</p>
          <p className="max-w-xl">
            Legal pages are initial drafts for review and are not legal advice. Payments are disabled in this build; no
            charges are made.
          </p>
        </div>
      </div>
    </footer>
  );
}
