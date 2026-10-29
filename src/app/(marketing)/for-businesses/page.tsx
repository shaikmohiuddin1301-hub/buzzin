import { CtaBand, FeatureGrid, MarketingHero, SectionHeading } from "@/components/marketing";
import { Alert, ButtonLink, Card, DefinitionList } from "@/components/ui";

export const metadata = { title: "For businesses" };

export default function ForBusinessesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="For businesses and organisations"
        title="Show the work behind the product"
        description="A business account gives your organisation a public portfolio of projects, controlled by real permissions, plus a private team view of what is still in progress."
        primary={{ href: "/business", label: "Set up a business" }}
        secondary={{ href: "/explore", label: "See project pages" }}
        aside={
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-navy-600">Business permissions</p>
            <div className="mt-3">
              <DefinitionList
                items={[
                  { term: "Owner", value: "Full control, including ownership transfer and removal of admins." },
                  { term: "Admin", value: "Edit the profile, add members, manage projects." },
                  { term: "Member", value: "Contribute to projects and view analytics." },
                ]}
              />
            </div>
          </Card>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
        <section>
          <SectionHeading
            eyebrow="Why it helps"
            title="Recruitment without a job-board race"
            description="You describe the work and the constraints. People self-select because they can see what the project actually is."
          />
          <div className="mt-6">
            <FeatureGrid
              features={[
                { title: "Project visibility", body: "Public, private or invite-only, enforced on the server for every request." },
                { title: "Collaborator discovery", body: "Skill-based discovery and expressions of interest instead of keyword CVs." },
                { title: "Progress documentation", body: "Milestones, updates and approved contributor documentation in one timeline." },
                { title: "Product storytelling", body: "Animated stories generated from approved records, with review before release." },
                { title: "Confidentiality controls", body: "Per-task visibility and confidentiality notes; private workspaces stay private." },
                { title: "IP clarity", body: "Record licensing and IP notes on the project so contributors know what applies." },
              ]}
            />
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Analytics" title="Platform analytics, clearly labelled" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">What you get</h3>
              <ul className="mt-2 space-y-1.5 text-[13px] text-navy-600">
                <li>Project views and follower counts from platform events</li>
                <li>Expressions of interest and their outcomes</li>
                <li>Milestone completion and contributor activity</li>
                <li>Story engagement and learning completion</li>
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">What you do not get</h3>
              <ul className="mt-2 space-y-1.5 text-[13px] text-navy-600">
                <li>Externally audited commercial results</li>
                <li>Private user content outside authorised workflows</li>
                <li>Ranking priority you can buy — placement is not for sale</li>
                <li>Guaranteed contributor quality; review is yours to do</li>
              </ul>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Compliance" title="Paid and unpaid arrangements" />
          <div className="mt-4 space-y-3">
            <Alert tone="warning" title="Listing work does not make it lawful">
              Businesses must state the arrangement accurately, respect local employment and tax law, and avoid presenting
              unpaid collaboration as an internship or employment opportunity. The platform records what both parties agreed
              but does not provide legal advice.
            </Alert>
            <Alert tone="info">
              Compensation types supported: unpaid with stated non-monetary benefit, paid, equity, revenue share, and
              negotiable. Payment execution is disabled in this build, so paid arrangements must be settled outside the
              platform.
            </Alert>
          </div>
          <div className="mt-6">
            <ButtonLink href="/business" variant="secondary">
              Open business workspace
            </ButtonLink>
          </div>
        </section>

        <CtaBand
          title="Publish the process, not just the launch"
          description="Create a business profile, attach it to your projects, and give collaborators a clear picture of the work."
          primary={{ href: "/auth/sign-up", label: "Create an account" }}
          secondary={{ href: "/pricing", label: "See pricing" }}
        />
      </div>
    </>
  );
}
