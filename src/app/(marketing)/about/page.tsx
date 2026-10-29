import { MarketingHero, SectionHeading } from "@/components/marketing";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        eyebrow="About"
        title="A platform built around evidence of work"
        description="BuildTogether is a demonstration product: a full-stack platform for project collaboration, contributor documentation, learning content and evidence-based reputation. It was built to test one hypothesis — that a connected record of real work is more useful than another portfolio, job board or course marketplace."
        primary={{ href: "/how-it-works", label: "How it works" }}
        secondary={{ href: "/contact", label: "Get in touch" }}
        aside={
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-navy-600">Status</p>
            <dl className="mt-3 space-y-3 text-[13px]">
              <div>
                <dt className="font-medium text-navy-900">Build</dt>
                <dd className="text-navy-600">Working demonstration, seeded with fictional data</dd>
              </div>
              <div>
                <dt className="font-medium text-navy-900">Payments</dt>
                <dd className="text-navy-600">Disabled by design</dd>
              </div>
              <div>
                <dt className="font-medium text-navy-900">AI</dt>
                <dd className="text-navy-600">Local deterministic provider; hosted provider interface ready</dd>
              </div>
              <div>
                <dt className="font-medium text-navy-900">Legal</dt>
                <dd className="text-navy-600">Draft documents pending professional review</dd>
              </div>
            </dl>
          </Card>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-14 px-4 py-16 sm:px-6">
        <section>
          <SectionHeading eyebrow="Why" title="Three problems, one loop" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Portfolios are claims",
                body: "A finished screenshot says nothing about the decisions, constraints or failures behind it.",
              },
              {
                title: "Contributions disappear",
                body: "Most collaboration leaves no durable, attributable record for the people who did the work.",
              },
              {
                title: "Learning is detached",
                body: "Tutorials are usually written away from the work, so the messy reality is edited out.",
              },
            ].map((item) => (
              <Card key={item.title} className="p-5">
                <h3 className="text-[14px] font-semibold text-navy-950">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-navy-600">{item.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Principles" title="How decisions were made" />
          <div className="prose-bt mt-4">
            <h3>Evidence over assertion</h3>
            <p>
              Contribution records point at a submission and name the reviewer. Owner-confirmed is never described as
              independently verified, because it is not. If a check did not happen, the interface says so.
            </p>
            <h3>Consent is a gate, not a checkbox</h3>
            <p>
              A contributor's documentation can only become public when the project enables it, and their consent is recorded
              when they choose to share. Withdrawing consent pulls public entries back to team scope.
            </p>
            <h3>Refuse to invent</h3>
            <p>
              The story generator composes narration only from approved records, cites each scene, and flags anything that
              needs review. It reports gaps rather than filling them. No testing metrics, testimonials or sales are fabricated
              anywhere in the demonstration data.
            </p>
            <h3>Server-side or it did not happen</h3>
            <p>
              Every visibility rule, role check and entitlement is enforced in the service layer. Hiding a button is a UX
              decision; it is never the security boundary.
            </p>
            <h3>Say what is missing</h3>
            <p>
              Payments, hosted AI, realtime chat, email delivery and object storage are deliberately not wired to external
              services in this build. The limitations are documented in the repository, not buried.
            </p>
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Who it is for" title="People doing practical work" />
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "founders",
              "small businesses",
              "professionals",
              "freelancers",
              "students",
              "graduates",
              "creators",
              "educators",
              "independent builders",
              "learners",
              "community organisations",
            ].map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-6">
            <Alert tone="info" title="Demonstration data">
              All people, projects, results and quotes in this environment are fictional and clearly labelled. The platform is
              not open for public registration; accounts are for evaluation.
            </Alert>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/explore">Explore the demo</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Contact
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
