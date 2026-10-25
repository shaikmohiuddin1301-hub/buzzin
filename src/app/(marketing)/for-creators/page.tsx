import { CtaBand, FeatureGrid, MarketingHero, SectionHeading, StepList } from "@/components/marketing";
import { Alert, ButtonLink, Card, Stat } from "@/components/ui";

export const metadata = { title: "For creators" };

export default function ForCreatorsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="For creators and educators"
        title="Teach the thing you actually did"
        description="Your best teaching material is the record of a real project: the decision you got wrong, the constraint that changed the design, the test that failed. BuildTogether keeps that record and helps you turn it into content."
        primary={{ href: "/studio", label: "Open creator studio" }}
        secondary={{ href: "/learn", label: "See the learning centre" }}
        aside={
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">What you can publish</p>
            <ul className="mt-3 space-y-2 text-[13px] text-navy-700">
              {["Free articles and practical guides", "Animated project stories", "Learning journeys from a task", "Courses with modules and exercises", "Workshops and resource packs", "Premium material with a free preview"].map((item) => (
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
          <SectionHeading eyebrow="Audience growth" title="Distribution follows usefulness" description="Content is linked to projects and tasks, so learners can trace a lesson back to the work that produced it." />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Discovery surfaces" value="6" hint="Explore, learn, feed, profile, project pages, search" />
            <Stat label="Attribution" value="Per scene" hint="Story scenes cite contributors and source records" />
            <Stat label="Free preview" value="Required" hint="Paid resources must include a free sample" />
            <Stat label="Payments" value="Disabled" hint="No charges are made in this build" />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Content pipeline" title="From work log to course" />
          <div className="mt-6">
            <StepList
              steps={[
                { title: "Document while working", body: "Notes, decisions and failures go into the workspace as they happen." },
                { title: "Build a journey", body: "Order the approved entries into a narrative with sources attached." },
                { title: "Get approval", body: "The project owner approves public use; you keep control of your own entries." },
                { title: "Publish and price", body: "Free by default. Add premium access with a stated refund policy and a free preview." },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Analytics" title="What you can see" description="Platform analytics only. Never presented as externally verified commercial results." />
          <div className="mt-6">
            <FeatureGrid
              features={[
                { title: "Content performance", body: "Views, saves, completion and learner feedback per resource." },
                { title: "Learner feedback", body: "Ratings and comments, with the ability to hide abusive feedback via moderation." },
                { title: "Access grants", body: "Who has access and why, with a full audit trail." },
                { title: "Teaching reputation", body: "A separate dimension so teaching is not confused with popularity." },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Earnings" title="No guarantees, no invented numbers" />
          <div className="mt-4 space-y-3">
            <Alert tone="warning" title="Earnings are not guaranteed">
              Nothing on this page promises income. Any commission the platform takes on educational sales must be disclosed
              clearly; it is not configured in this build because payments are disabled.
            </Alert>
            <Alert tone="info" title="What would need to be true before charging">
              Marketplace eligibility and KYC checks, consumer-rights review (including cancellation rights), a tax and
              payout model, a refund policy enforced server-side, and a payment provider integration with validated
              webhooks. See the roadmap in the repository.
            </Alert>
          </div>
          <div className="mt-6">
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">How premium works in this build</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                Products carry a listing price, but access is a grant recorded in the entitlements table. Paid content is
                withheld on the server: unentitled requests receive only the preview, even if they bypass the UI.
              </p>
              <ButtonLink href="/studio/products/new" size="sm" variant="secondary" className="mt-4">
                Create a product
              </ButtonLink>
            </Card>
          </div>
        </section>

        <CtaBand
          title="Publish your first free lesson"
          description="Start with one thing you learned the hard way. Add the source record. That is the whole entry requirement."
          primary={{ href: "/studio", label: "Open studio" }}
          secondary={{ href: "/for-learners", label: "What learners see" }}
        />
      </div>
    </>
  );
}
