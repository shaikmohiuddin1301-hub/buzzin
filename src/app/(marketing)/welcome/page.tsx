import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CircleDollarSign,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getDb } from "@/db/client";
import { learningResources, projectSkills, skills, storyScenes, storyboards, users } from "@/db/schema";
import { CtaBand, FaqList, FeatureGrid, MarketingHero, SectionHeading, StepList } from "@/components/marketing";
import { ProjectCard, ResourceCard, StoryCard } from "@/components/cards";
import { StoryPlayer } from "@/components/client/story-player";
import { Badge, ButtonLink, Card, Progress, SkillTag } from "@/components/ui";
import { featuredProjects } from "@/services/projects";
import { publishedStories } from "@/services/stories";
import { listResources } from "@/services/learning";
import { reputationSummary } from "@/lib/reputation";
import { label } from "@/lib/types";

/**
 * The public marketing landing page.
 *
 * It used to be the root URL. The root is now the app entry gate, so the landing
 * page moved here unchanged, with its own canonical URL for search engines.
 */
export const metadata: Metadata = {
  title: { absolute: "BuildTogether — build real things, teach what you learn" },
  description:
    "BuildTogether is where people discover real projects, collaborate on meaningful work, document the process, turn it into learning and build a credible reputation.",
  alternates: { canonical: "/welcome" },
  openGraph: {
    title: "BuildTogether",
    description:
      "Discover real projects, contribute to work that matters, document the journey and teach what you learn.",
    type: "website",
    url: "/welcome",
  },
};

export default async function WelcomePage() {
  const db = getDb();
  const projects = featuredProjects(3);
  const stories = publishedStories(2);
  const resources = listResources({ limit: 3 });
  const courses = listResources({ format: "course", limit: 3 });

  const previewStory = stories[0];
  const scenes = previewStory
    ? db
        .select()
        .from(storyScenes)
        .where(eq(storyScenes.storyboardId, previewStory.board.id))
        .orderBy(asc(storyScenes.orderIndex))
        .all()
    : [];

  const jonas = db.select().from(users).where(eq(users.username, "jonas_b")).get();
  const reputation = jonas ? reputationSummary(jonas.id) : null;

  const projectCards = projects.map((project) => ({
    ...project,
    skills: db
      .select({ id: skills.id, name: skills.name, slug: skills.slug })
      .from(projectSkills)
      .innerJoin(skills, eq(skills.id, projectSkills.skillId))
      .where(eq(projectSkills.projectId, project.id))
      .limit(3)
      .all(),
  }));

  const shareable = db
    .select()
    .from(learningResources)
    .where(eq(learningResources.status, "published"))
    .orderBy(desc(learningResources.publishedAt))
    .limit(2)
    .all();

  return (
    <>
      <MarketingHero
        eyebrow="Project work · documentation · learning · reputation"
        title={
          <>
            Build something real.
            <br />
            Teach what you learn.
            <br />
            <span className="text-brand-600">Earn trust you can point to.</span>
          </>
        }
        description={
          <>
            BuildTogether connects the whole arc of practical work: discover a project, contribute to a task, document the
            process, turn it into learning material, and build a reputation from accepted work rather than follower counts.
          </>
        }
        primary={{ href: "/explore", label: "Explore projects" }}
        secondary={{ href: "/projects/new", label: "Start building" }}
        aside={
          <Card className="overflow-hidden">
            <div className="border-b border-navy-200 bg-brand-600 px-5 py-4 text-on-brand">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-brand/60">Live from the feed</p>
              <p className="mt-1 text-[13px] text-on-brand/75">
                Documentation → story → learning, connected to the same source records.
              </p>
            </div>
            {previewStory && scenes.length > 0 ? (
              <div className="p-4">
                <StoryPlayer
                  title={previewStory.board.title}
                  scenes={scenes.map((scene) => ({
                    id: scene.id,
                    title: scene.title,
                    narration: scene.narration,
                    visualDescription: scene.visualDescription,
                    durationSeconds: scene.durationSeconds,
                    sourceLabel: scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : null,
                    contributors: (scene.contributors ?? []).map((person) => person.name),
                    factStatus: scene.factStatus,
                    aiGenerated: scene.aiGenerated,
                  }))}
                />
                <p className="mt-3 text-[11px] leading-5 text-navy-500">
                  Every scene links to the approved record it came from. Nothing is invented: unsupported claims are
                  flagged, and a story cannot be published without an approval record.
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-5">
                <p className="text-[13px] font-semibold text-navy-900">A project story, built from the paper trail</p>
                <p className="text-[12px] leading-6 text-navy-600">
                  Run <code className="rounded bg-navy-100 px-1 py-0.5 font-mono text-[11px]">npm run db:seed</code> to load the
                  fictional demonstration project whose story plays here.
                </p>
                <Progress value={68} label="Storyboard → review → publish" />
              </div>
            )}
          </Card>
        }
      />

      <section className="border-b border-navy-200 bg-navy-50/60">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {[
            { icon: <Layers size={16} aria-hidden="true" />, title: "Projects, not job ads", body: "Real work with scope, milestones and public progress." },
            { icon: <FileText size={16} aria-hidden="true" />, title: "Documentation by default", body: "Work logs capture decisions, failures and revisions." },
            { icon: <Sparkles size={16} aria-hidden="true" />, title: "Stories from evidence", body: "Animations cite their sources and require approval." },
            { icon: <ShieldCheck size={16} aria-hidden="true" />, title: "Reputation with receipts", body: "Owner-confirmed records, clearly labelled as such." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="mt-0.5 text-brand-600">{item.icon}</span>
              <div>
                <p className="text-[12.5px] font-semibold text-navy-900">{item.title}</p>
                <p className="text-[11.5px] leading-5 text-navy-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-20 px-4 py-16 sm:px-6">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="How the platform works"
              title="One connected loop, not five disconnected features"
              description="Each stage feeds the next, so the work you do becomes the proof, the teaching material and the reason someone finds you."
            />
            <ButtonLink href="/how-it-works" variant="secondary" size="sm">
              Read the full loop
            </ButtonLink>
          </div>
          <div className="mt-8">
            <StepList
              steps={[
                { title: "Discover & watch", body: "Follow projects and people. See progress as it happens, not just launches." },
                { title: "Contribute with clear scope", body: "Express interest, agree deliverables and acceptance criteria in writing." },
                { title: "Document the process", body: "Notes, decisions, experiments and failures — with visibility you control." },
                { title: "Publish, teach, earn", body: "Turn accepted work into a portfolio entry, a learning journey or a paid course." },
              ]}
            />
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Discovery" title="Projects looking for the right people" description="Sample projects from the demonstration dataset." />
            <ButtonLink href="/explore" variant="ghost" size="sm">
              Explore all <ArrowRight size={14} aria-hidden="true" />
            </ButtonLink>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {projectCards.length > 0 ? (
              projectCards.map((project) => <ProjectCard key={project.id} project={project} />)
            ) : (
              <div className="rounded-lg border border-dashed border-navy-200 p-6 text-sm text-navy-500 md:col-span-3">
                <p className="font-medium text-navy-700">No public projects have been published yet.</p>
                <p className="mt-1">
                  Create an account to publish the first one — a project, its team and its accepted contributions will
                  appear here as soon as it is live.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Reputation"
              title="Four dimensions, never one mysterious score"
              description="Contribution, expertise, teaching quality and influence are shown separately, each traceable to specific records."
            />
            <div className="mt-6 space-y-4">
              {reputation ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["contribution", "Accepted task deliveries, confirmed by the owner"],
                        ["expertise", "Demonstrated skill across documented tasks"],
                        ["teaching", "Published learning material and learner feedback"],
                        ["influence", "Reach: followers, stories and discovery"],
                      ] as const
                    ).map(([key, hint]) => (
                      <div key={key} className="rounded-xl border border-navy-200 bg-surface p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">{label(key)}</p>
                          <BadgeCheck size={14} aria-hidden="true" className="text-brand-600" />
                        </div>
                        <p className="mt-1 text-xl font-semibold text-navy-950">{reputation.totals[key]}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-navy-500">{hint}</p>
                      </div>
                    ))}
                  </div>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-navy-900">Why these numbers exist</p>
                      <Link href={`/u/${jonas?.username ?? ""}`} className="text-[11px] font-medium text-brand-600 hover:underline">
                        Example profile →
                      </Link>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-[12px] leading-5 text-navy-600">
                      {reputation.recent.slice(0, 3).map((event, index) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span>{event.reason}</span>
                          <span className="shrink-0 font-medium text-navy-800">+{event.points}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-navy-200 pt-2 text-[11px] text-navy-500">
                      Every point is a row in the reputation ledger tied to a project, task or resource. Owner-confirmed is
                      never described as independently verified.
                    </p>
                  </Card>
                </>
              ) : (
                <Card className="p-5 text-sm text-navy-600">
                  Reputation appears here once accepted deliveries exist — every point is a record, not a score out of ten.
                </Card>
              )}
            </div>
          </div>

          <div>
            <SectionHeading
              eyebrow="Two income streams"
              title="Paid project work and paid teaching are separate"
              description="One is an arrangement between collaborators. The other is a marketplace for learning content. They have different obligations, so they are modelled separately."
            />
            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-navy-200 bg-surface p-5">
                <div className="flex items-center gap-2">
                  <Users size={16} aria-hidden="true" className="text-brand-600" />
                  <h3 className="text-[14px] font-semibold text-navy-950">Project contributions</h3>
                </div>
                <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                  Owners state the arrangement up front — unpaid with credit, paid, equity or revenue share — with agreed
                  scope and acceptance criteria. The platform warns that listing unpaid work does not make it lawful and does
                  not create an employment relationship.
                </p>
              </div>
              <div className="rounded-xl border border-navy-200 bg-surface p-5">
                <div className="flex items-center gap-2">
                  <CircleDollarSign size={16} aria-hidden="true" className="text-brand-600" />
                  <h3 className="text-[14px] font-semibold text-navy-950">Educational content</h3>
                </div>
                <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                  Creators publish free lessons, courses, workshops and resource packs. Premium access exists, but{" "}
                  <strong className="font-semibold text-navy-800">payments are disabled in this build</strong>: access is
                  granted directly and entitlements are enforced on the server.
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[12px] font-semibold text-amber-900">Honest limits</p>
                <p className="mt-1 text-[12px] leading-5 text-amber-700">
                  No earnings are guaranteed. The demonstration data contains no real sales, revenue or testimonials.
                  Commission arrangements and tax obligations must be decided before any payment rail is enabled.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Example project stories" title="Animated explainers, generated only from the record" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stories.length > 0 ? (
              stories.map((story) => (
                <StoryCard key={story.board.id} board={story.board} projectName={story.projectName} />
              ))
            ) : (
              <p className="text-sm text-navy-500">No published stories yet.</p>
            )}
          </div>
        </section>

        {courses.length > 0 ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="Structured courses"
                title="A guided path, not just a pile of tutorials"
                description="Free courses built from original lessons, credited external videos and practical project work."
              />
              <ButtonLink href="/courses" variant="ghost" size="sm">
                All courses <ArrowRight size={14} aria-hidden="true" />
              </ButtonLink>
            </div>
            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {courses.map((course) => (
                <ResourceCard key={course.id} resource={course} href={`/courses/${course.id}`} />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Learning" title="Practical material, linked to real work" />
            <ButtonLink href="/learn" variant="ghost" size="sm">
              Learning centre <ArrowRight size={14} aria-hidden="true" />
            </ButtonLink>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {resources.slice(0, 2).map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
            {resources.length === 0
              ? shareable.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={{
                      id: resource.id,
                      title: resource.title,
                      summary: resource.summary,
                      format: resource.format,
                      level: resource.level,
                      priceCents: resource.priceCents,
                      durationMinutes: resource.durationMinutes,
                      coverImageId: resource.coverImageId,
                    }}
                  />
                ))
              : null}
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="For creators and businesses"
            title="Build an audience without renting one"
            description="Publish what you actually did. Your documentation, teaching and confirmed contributions become a durable public record."
          />
          <div className="mt-6">
            <FeatureGrid
              features={[
                {
                  title: "Creator studio",
                  body: "Draft, schedule and publish posts, journeys and courses, with previews and version history.",
                  icon: <BookOpen size={18} aria-hidden="true" />,
                },
                {
                  title: "Business accounts",
                  body: "Represent an organisation, manage team roles, publish project portfolios and see platform analytics.",
                  icon: <Users size={18} aria-hidden="true" />,
                },
                {
                  title: "Attribution you control",
                  body: "Contributors decide when their documentation can be made public and can withdraw consent later.",
                  icon: <ShieldCheck size={18} aria-hidden="true" />,
                },
              ]}
            />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">For creators</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                Free lessons build reach; deeper material can be premium. Analytics show what is used and completed, not
                just what is clicked.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["audience growth", "free content", "premium material", "analytics"].map((tag) => (
                  <SkillTag key={tag} name={tag} />
                ))}
              </div>
              <ButtonLink href="/for-creators" variant="secondary" size="sm" className="mt-4">
                Creator overview
              </ButtonLink>
            </Card>
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold text-navy-950">For businesses</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
                Show the work behind the product, recruit collaborators with clear scopes and keep confidentiality controls
                on the parts that are not public.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["project visibility", "collaborators", "progress documentation"].map((tag) => (
                  <SkillTag key={tag} name={tag} />
                ))}
              </div>
              <ButtonLink href="/for-businesses" variant="secondary" size="sm" className="mt-4">
                Business overview
              </ButtonLink>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="Illustrative examples"
            title="What people say"
            description="These are fictional examples written for this demonstration build. They are not real testimonials from real users."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  "I stopped writing portfolio pieces that claim what I can do. The project record shows what I actually delivered, including the parts that failed first.",
                name: "Illustrative contributor",
                role: "Backend engineer, fictional example",
              },
              {
                quote:
                  "The documentation requirement felt heavy for a week. Then a volunteer group copied our build guide and it saved them a month.",
                name: "Illustrative project owner",
                role: "Climate project lead, fictional example",
              },
              {
                quote:
                  "My course is built from a real fieldwork task. Learners can open the source documentation and see the limits of the data themselves.",
                name: "Illustrative educator",
                role: "Data analyst, fictional example",
              },
            ].map((item) => (
              <figure key={item.name} className="rounded-xl border border-navy-200 bg-surface p-5">
                <blockquote className="text-[13px] leading-6 text-navy-700">“{item.quote}”</blockquote>
                <figcaption className="mt-3 border-t border-navy-200 pt-3 text-[11px] text-navy-500">
                  <span className="font-semibold text-navy-700">{item.name}</span>
                  <br />
                  {item.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading eyebrow="Questions" title="Frequently asked" />
          <div className="mt-6">
            <FaqList
              items={[
                {
                  q: "Is BuildTogether a job board?",
                  a: "No. Work is collaborative: you express interest, agree scope with the owner, and document the process. Paid arrangements are possible but are agreements between the parties, not employment listings.",
                },
                {
                  q: "How is a contribution 'verified'?",
                  a: "An accepted submission reviewed by the project owner creates an owner-confirmed contribution record. It records who confirmed it and on what evidence. It is never described as independently verified unless a separate review process actually happened.",
                },
                {
                  q: "Does the AI make things up?",
                  a: "In this build, story generation is deterministic: it composes narration only from approved documentation and flags scenes whose facts need review. There is no hosted language model, so nothing is embellished. A hosted provider can be added behind the same interface.",
                },
                {
                  q: "Can I get paid?",
                  a: "Payments are disabled in this build. Premium learning products exist and entitlements are enforced server-side, but access is granted directly by the creator. No card data is collected and no charge is made.",
                },
                {
                  q: "What happens to my documentation if I leave?",
                  a: "You control the visibility of your own entries, can withdraw public-story consent, and can export or delete your account. Deletion scrubs personal identifiers while preserving accurate contribution history.",
                },
                {
                  q: "How is reputation calculated?",
                  a: "Four dimensions are tracked separately, with every point tied to a source record. There is no single overall score, because reducing a person to one number is both misleading and easy to game.",
                },
              ]}
            />
          </div>
        </section>

        <CtaBand
          title="Start with something small and finish it"
          description="Pick a project, take one clearly-scoped task, document what happens, and let the record speak for itself."
          primary={{ href: "/explore", label: "Explore projects" }}
          secondary={{ href: "/how-it-works", label: "See how it works" }}
        />
      </div>
    </>
  );
}
