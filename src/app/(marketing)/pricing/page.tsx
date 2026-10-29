import Link from "next/link";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { SectionHeading } from "@/components/marketing";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <Badge tone="warning">Illustrative pricing — not yet configured</Badge>
        <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-navy-950 sm:text-[38px]">Pricing</h1>
        <p className="mt-3 text-[15px] leading-7 text-navy-600">
          Prices below are placeholders for planning. Nothing is charged in this build: there is no checkout, no card
          processing and no subscription billing. Free accounts have full access to the core product.
        </p>
      </div>

      <div className="mt-8">
        <Alert tone="warning" title="Do not treat these as committed prices">
          Tiers, limits and commission rates must be decided after cost modelling, marketplace eligibility checks and
          consumer-law review. Payments remain disabled until then.
        </Alert>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {[
          {
            name: "Free",
            price: "£0",
            cadence: "forever",
            description: "For learners and first-time contributors.",
            features: [
              "Browse and follow projects",
              "Express interest and contribute",
              "Document your work",
              "Free learning resources",
              "Profile with evidence-based reputation",
            ],
            cta: { href: "/auth/sign-up", label: "Create a free account" },
            highlight: false,
          },
          {
            name: "Builder",
            price: "£12",
            cadence: "per month (illustrative)",
            description: "For creators publishing regularly.",
            features: [
              "Everything in Free",
              "Creator studio and premium products",
              "Story generation and animated exports",
              "Content and learner analytics",
              "Priority review queue (planned)",
            ],
            cta: { href: "/studio", label: "Open creator studio" },
            highlight: true,
          },
          {
            name: "Business",
            price: "£49",
            cadence: "per month (illustrative)",
            description: "For organisations running multiple projects.",
            features: [
              "Everything in Builder",
              "Business profile and team roles",
              "Multiple projects and portfolio page",
              "Business analytics",
              "Confidentiality and IP settings",
            ],
            cta: { href: "/business", label: "Open business workspace" },
            highlight: false,
          },
        ].map((tier) => (
          <Card
            key={tier.name}
            className={tier.highlight ? "relative border-gold-300 ring-1 ring-gold-200" : ""}
          >
            {tier.highlight ? (
              <div className="absolute right-4 top-4">
                <Badge tone="gold">Planned</Badge>
              </div>
            ) : null}
            <div className="p-5">
              <h2 className="text-[15px] font-semibold text-navy-950">{tier.name}</h2>
              <p className="mt-1 text-[12px] text-navy-500">{tier.description}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-navy-950">{tier.price}</p>
              <p className="text-[11px] text-navy-500">{tier.cadence}</p>
              <ul className="mt-4 space-y-1.5 text-[12.5px] text-navy-600">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <ButtonLink href={tier.cta.href} variant={tier.highlight ? "primary" : "secondary"} size="sm" className="mt-5 w-full">
                {tier.cta.label}
              </ButtonLink>
            </div>
          </Card>
        ))}
      </div>

      <section className="mt-12">
        <SectionHeading eyebrow="Educational sales" title="Creator commission (not configured)" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-[14px] font-semibold text-navy-950">What is modelled today</h3>
            <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
              Creators can create premium products with a listing price, a free preview and a refund policy. Access is
              granted directly by the creator and recorded as an entitlement with an audit entry. Server-side checks gate the
              paid body of the resource.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="text-[14px] font-semibold text-navy-950">What is deliberately absent</h3>
            <ul className="mt-1.5 space-y-1 text-[13px] text-navy-600">
              <li>No card fields, no payment intent, no stored payment methods</li>
              <li>No commission calculation or payout ledger</li>
              <li>No tax handling or invoices</li>
              <li>No refund automation — refunds are a policy statement, not a transaction</li>
            </ul>
          </Card>
        </div>
      </section>

      <p className="mt-10 text-[12px] text-navy-500">
        Questions about pricing or the planned commercial model?{" "}
        <Link href="/contact" className="underline">
          Contact us
        </Link>
        .
      </p>
    </div>
  );
}
