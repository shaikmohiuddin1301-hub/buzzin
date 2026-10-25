import { CtaBand, FeatureGrid, MarketingHero, SectionHeading, StepList } from "@/components/marketing";
import { Alert, Card, SkillTag } from "@/components/ui";

export const metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <>
      <MarketingHero
        eyebrow="The loop"
        title="From a first message to a published learning journey"
        description="BuildTogether is designed around one loop. Each stage creates a record that the next stage can use — which is why documentation is not an afterthought here."
        primary={{ href: "/explore", label: "Find a project" }}
        secondary={{ href: "/projects/new", label: "Start a project" }}
        aside={
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">In one sentence</p>
            <p className="mt-2 text-[15px] leading-7 text-navy-800">
              Build something → document the work → turn the journey into learning → build reputation and an audience →
              unlock better work.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              {["Discovery", "Scope", "Documentation", "Review", "Learning", "Reputation"].map((label) => (
                <span key={label} className="rounded-md bg-navy-50 px-2 py-1 font-medium text-navy-700">
                  {label}
                </span>
              ))}
            </div>
          </Card>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
        <section>
          <SectionHeading eyebrow="Step by step" title="What actually happens" />
          <div className="mt-8 space-y-6">
            {[
              {
                title: "1 · Discovery",
                body: "Browse projects and people. Filters cover category, required skills, stage, remote/local/hybrid, compensation type, effort and deadline. Private projects never appear; invite-only projects show a limited summary so you can still ask to be considered.",
                detail: "Server rule: listing queries always filter by published + not-private, and never trust a client-supplied visibility flag.",
              },
              {
                title: "2 · Expressing interest",
                body: "You can say you want to contribute, discuss the idea, join the team, help with a specific task, or offer feedback. Notes and work samples are optional. Owners see the person's profile and can reply with a decision and a message.",
                detail: "Server rule: you cannot express interest in your own project, and duplicates for the same task are rejected.",
              },
              {
                title: "3 · Agreeing the work",
                body: "The owner publishes tasks with deliverables and acceptance criteria. When a task is assigned, both sides confirm the scope — including deadline, responsibilities and any compensation. Nothing is implied by silence.",
                detail: "Server rule: a task cannot be published without acceptance criteria, and unpaid work requires a stated non-monetary agreement.",
              },
              {
                title: "4 · Doing and documenting",
                body: "The contributor workspace captures notes, links, experiments, decisions, challenges and revisions. Each entry has its own visibility: private to you, team only, awaiting approval, or public. Public documentation is only possible when the project enables it.",
                detail: "Server rule: the project's public-documentation setting is checked on every write, and consent is recorded when an entry is shared.",
              },
              {
                title: "5 · Submission and review",
                body: "Deliverables are submitted with a note. The owner accepts or requests changes with a reason. Acceptance creates an owner-confirmed contribution record with a link to the submission that justified it.",
                detail: "Server rule: an upload alone never creates a verified contribution; only an accepted, reviewed submission does.",
              },
              {
                title: "6 · Story and learning",
                body: "Approved documentation can be composed into an AI storyboard and an animated explainer, or into a learning journey. Both cite their source records and require review before publication.",
                detail: "Server rule: consent is checked per contributor; team-only notes are never used; authors cannot approve their own stories.",
              },
              {
                title: "7 · Reputation and opportunity",
                body: "Contribution, expertise, teaching and influence are tracked separately. Profiles show the evidence behind each indicator, and attribution can be disputed and corrected.",
                detail: "Server rule: reputation events are idempotent per source, so double-review or webhook retries cannot inflate a score.",
              },
            ].map((step) => (
              <div key={step.title} className="grid gap-3 rounded-xl border border-navy-200 bg-white p-5 md:grid-cols-[220px_1fr]">
                <h3 className="text-[14px] font-semibold text-navy-950">{step.title}</h3>
                <div>
                  <p className="text-[13px] leading-6 text-navy-600">{step.body}</p>
                  <p className="mt-2 rounded-md bg-navy-50 px-3 py-2 text-[11.5px] leading-5 text-navy-600">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Who it is for" title="Different starting points, the same loop" />
          <div className="mt-6">
            <FeatureGrid
              features={[
                { title: "Founders and small teams", body: "Find people who can actually help, with scope agreed before work starts." },
                { title: "Freelancers and professionals", body: "Build a public record of delivered work, not just a portfolio of claims." },
                { title: "Students and career switchers", body: "Contribute to real projects, learn from documented decisions, and show evidence." },
                { title: "Educators and creators", body: "Turn practical experience into structured teaching with proper attribution." },
                { title: "Community organisations", body: "Document volunteer work so it can be copied, funded and credited." },
                { title: "Businesses", body: "Show the process behind a product and recruit collaborators with clear confidentiality controls." },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Honesty" title="What this build does not do" />
          <div className="mt-6">
            <Alert tone="warning" title="Deliberately incomplete">
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>Payments are excluded: no card handling, no charges, no payouts. Premium access is granted directly.</li>
                <li>No hosted AI is called. Story generation is deterministic and local, and a hosted provider can be added behind the same interface.</li>
                <li>Chat uses polling, not a realtime transport. Read state is per conversation, not per message.</li>
                <li>Email is written to a local outbox in development rather than delivered by an SMTP provider.</li>
              </ul>
            </Alert>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["Next.js", "TypeScript", "SQLite + Drizzle", "scrypt sessions", "provider interfaces"].map((tag) => (
              <SkillTag key={tag} name={tag} />
            ))}
          </div>
        </section>

        <CtaBand
          title="See it working with the demo dataset"
          description="Sign in with a seeded account and walk the whole loop: interest → acceptance → documentation → review → story → learning."
          primary={{ href: "/auth/sign-in", label: "Sign in to the demo" }}
          secondary={{ href: "/explore", label: "Browse projects first" }}
        />
      </div>
    </>
  );
}
