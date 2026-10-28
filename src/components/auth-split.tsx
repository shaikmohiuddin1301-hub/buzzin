import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Branded split screen used by the entry gate and every authentication page.
 * Focused on one task: no app navigation, no feed, no sidebar.
 */
export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-surface min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
        <div className="order-2 flex flex-col justify-center px-5 py-10 sm:px-10 lg:order-1">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <Logo />
            </div>
            {children}
            <p className="mt-8 text-center text-[12px] text-navy-500">
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline hover:text-navy-800">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-navy-800">
                privacy notice
              </Link>
              .
            </p>
          </div>
        </div>

        <aside className="order-1 hidden ink-surface p-10 text-white lg:order-2 lg:flex lg:flex-col lg:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">BuildTogether</p>
          <div>
            <h2 className="text-3xl font-semibold leading-tight">
              Build something real.
              <br />
              Document the journey.
              <br />
              Teach what you learn.
            </h2>
            <ul className="mt-8 space-y-4 text-[13px] leading-6 text-white/70">
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                Express interest in work you actually want to do — not another job board.
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                Your contribution record is built from accepted, documented work.
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                Turn a completed project into a learning journey with proper attribution.
              </li>
            </ul>
          </div>
          <p className="text-[12px] text-navy-400">
            Demonstration environment. Sample projects and testimonials are clearly labelled as illustrative.
          </p>
        </aside>
      </div>
    </div>
  );
}
