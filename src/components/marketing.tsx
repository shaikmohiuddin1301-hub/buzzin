import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Badge, ButtonLink, cn } from "@/components/ui";

export function MarketingHero({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  aside,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-navy-100 bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(50% 50% at 15% 10%, rgba(109,74,255,0.10), transparent 70%), radial-gradient(40% 40% at 90% 0%, rgba(19,30,51,0.07), transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          {eyebrow ? (
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-tight text-navy-950 sm:text-[46px]">{title}</h1>
          <div className="mt-5 max-w-xl text-[15px] leading-7 text-navy-600">{description}</div>
          {primary || secondary ? (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {primary ? (
                <ButtonLink href={primary.href} size="lg">
                  {primary.label}
                </ButtonLink>
              ) : null}
              {secondary ? (
                <ButtonLink href={secondary.href} size="lg" variant="secondary">
                  {secondary.label}
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
          <p className="mt-4 text-[12px] text-navy-500">
            Demonstration build · sample content is fictional and labelled · payments disabled
          </p>
        </div>
        {aside ? <div className="lg:pl-4">{aside}</div> : null}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">{eyebrow}</p> : null}
      <h2 className="text-[26px] font-semibold tracking-tight text-navy-950 sm:text-[32px]">{title}</h2>
      {description ? <p className="mt-3 text-[14.5px] leading-7 text-navy-600">{description}</p> : null}
    </div>
  );
}

export function FeatureGrid({
  features,
  columns = 3,
}: {
  features: { title: string; body: string; icon?: ReactNode }[];
  columns?: 2 | 3;
}) {
  return (
    <div className={cn("grid gap-4", columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {features.map((feature) => (
        <div key={feature.title} className="rounded-xl border border-navy-200 bg-surface p-5">
          {feature.icon ? <div className="mb-3 text-brand-600">{feature.icon}</div> : null}
          <h3 className="text-[14px] font-semibold text-navy-950">{feature.title}</h3>
          <p className="mt-1.5 text-[13px] leading-6 text-navy-600">{feature.body}</p>
        </div>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: { title: string; body: string; detail?: string }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.title} className="rounded-xl border border-navy-200 bg-surface p-5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full ink-surface text-[13px] font-semibold text-white">
            {index + 1}
          </span>
          <h3 className="mt-3 text-[14px] font-semibold text-navy-950">{step.title}</h3>
          <p className="mt-1.5 text-[13px] leading-6 text-navy-600">{step.body}</p>
          {step.detail ? <p className="mt-2 rounded-md bg-navy-50 px-2 py-1.5 text-[11px] text-navy-600">{step.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-navy-100 rounded-xl border border-navy-200 bg-surface">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-navy-900 [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="text-navy-400 transition group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-navy-600">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="rounded-2xl bg-brand-600 px-6 py-10 text-white sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="text-[24px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-[14px] leading-6 text-white/75">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={primary.href} size="lg" className="bg-brand-600 hover:bg-brand-500">
            {primary.label}
          </ButtonLink>
          {secondary ? (
            <ButtonLink href={secondary.href} size="lg" variant="secondary" className="border-white/20 bg-transparent text-white hover:bg-white/10">
              {secondary.label}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  needsReview = true,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; id?: string; paragraphs?: string[]; bullets?: string[] }[];
  needsReview?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <Badge tone="neutral">Last drafted {updated}</Badge>
      <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-navy-950">{title}</h1>
      <p className="mt-3 text-[15px] leading-7 text-navy-600">{intro}</p>

      {needsReview ? (
        <div className="mt-6">
          <Alert tone="warning" title="Draft pending professional review">
            This is an initial draft written for a demonstration build. It is not legal advice and must be reviewed by a
            qualified lawyer before any public launch, particularly the sections on consumer rights, intellectual property,
            paid work and marketplace arrangements.
          </Alert>
        </div>
      ) : null}

      <div className="prose-bt mt-8">
        {sections.map((section, index) => (
          <section key={section.heading} id={section.id ?? `s${index + 1}`}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
            {section.bullets ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet.slice(0, 40)}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-navy-100 pt-6 text-[12px] text-navy-500">
        Questions about this page? <Link href="/contact" className="underline">Contact us</Link>.
      </p>
    </div>
  );
}
