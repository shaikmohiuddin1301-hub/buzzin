import { CtaBand, FeatureGrid, MarketingHero, SectionHeading } from "@/components/marketing";
import { Alert, ButtonLink, Card } from "@/components/ui";

export const metadata = { title: "For learners" };

export default function ForLearnersPage() {
  return (
    <>
      <MarketingHero
        eyebrow="For learners"
        title="Learn from work that actually happened"
        description="Most tutorials skip the part that matters: what went wrong, what it cost, and why a decision was made. BuildTogether's learning material is built from documented project records, with sources attached."
        primary={{ href: "/learn", label: "Browse learning" }}
        secondary={{ href: "/explore", label: "Follow a project" }}
        aside={
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">What a resource contains</p>
            <ul className="mt-3 space-y-2 text-[13px] text-navy-700">
              {[
                "A free preview before any paid access",
                "Transcript and captions for media",
                "The tools and skills actually used",
                "Exercises you can do on your own work",
                "Links to the project and task it came from",
                "Stated limitations and what did not work",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
        <section>
          <SectionHeading eyebrow="How learning works" title="Practice, evidence, then interpretation" />
          <div className="mt-6">
            <FeatureGrid
              features={[
                { title: "Follow real projects", body: "Watch a project progress, including the revisions and blockers." },
                { title: "Case studies with sources", body: "Each scene or step cites the documentation it came from." },
                { title: "Guided exercises", body: "Apply the approach to your own context rather than copying a demo." },
                { title: "Learning journeys", body: "Ordered steps through a task: context, decisions, experiments, outcomes." },
                { title: "Progress tracking", body: "Mark lessons complete and pick up where you stopped." },
                { title: "Honest difficulty", body: "Beginner, intermediate and advanced are set by the creator and shown up front." },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Access" title="Free by default, premium where it is justified" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">Free</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                Articles, project stories, community guides and the first lesson of most courses. No account needed to read;
                an account lets you save, comment and track progress.
              </p>
            </Card>
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">Premium</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                Deeper courses and resource packs. <strong>Payments are disabled in this build</strong> — access is granted
                by the creator, and entitlement checks happen on the server so the content is genuinely gated.
              </p>
            </Card>
          </div>
          <div className="mt-4">
            <Alert tone="info" title="Your data and learning history">
              You can export your data or delete your account from settings. Deleting your account removes personal
              identifiers; it does not silently rewrite other people's contribution records.
            </Alert>
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Start here" title="Three useful first moves" />
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { title: "Follow one project", body: "Pick something in a field you care about and read its progress tab end to end." },
              { title: "Do one exercise", body: "Apply the limitation-writing exercise from the field data course to your own last project." },
              { title: "Document something small", body: "Contribute a tiny, well-scoped task and write one honest work-log entry." },
            ].map((item, index) => (
              <li key={item.title} className="rounded-xl border border-navy-200 bg-white p-5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-950 text-[12px] font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-2.5 text-[14px] font-semibold text-navy-950">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-navy-600">{item.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <ButtonLink href="/learn" variant="secondary">
              Open the learning centre
            </ButtonLink>
          </div>
        </section>

        <CtaBand
          title="Learn, then contribute"
          description="The fastest way to learn a practice is to use it on a real task with someone who will review it."
          primary={{ href: "/auth/sign-up", label: "Create a free account" }}
          secondary={{ href: "/explore", label: "Find a project" }}
        />
      </div>
    </>
  );
}
