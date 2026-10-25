/**
 * Development seed data.
 *
 * Every person, project, testimonial and result here is fictional and exists only
 * to demonstrate the product. Run with `npm run db:seed` after `npm run db:migrate`.
 * The script wipes application tables first so it is repeatable.
 */
import { getDb, getSqlite, transaction } from "./client";
import { runMigrations } from "./migrate";
import {
  achievements,
  analyticsEvents,
  authTokens,
  blockedUsers,
  businessMembers,
  businesses,
  challenges,
  comments,
  consentRecords,
  contributorAttributions,
  conversationMembers,
  conversations,
  courseModules,
  courses,
  creatorProducts,
  deliverables,
  disputes,
  entitlements,
  exercises,
  expressionsOfInterest,
  follows,
  generatedMedia,
  learningJourneySteps,
  learningJourneys,
  learningProgress,
  learningResources,
  learnerFeedback,
  lessons,
  mediaApprovals,
  mediaFiles,
  messages,
  moderationActions,
  notifications,
  orderItems,
  orders,
  posts,
  projectFollows,
  projectInvitations,
  projectMembers,
  projectMilestones,
  projectSkills,
  projectUpdates,
  projects,
  reactions,
  reports,
  reputationEvents,
  savedItems,
  skills,
  storyScenes,
  storyboards,
  taskAssignments,
  taskReviews,
  taskSkills,
  taskSubmissions,
  tasks,
  userPreferences,
  userRoles,
  userSkills,
  users,
  workLogEntries,
} from "./schema";
import { hashPassword } from "../src/lib/password";
import { getStoryProvider } from "../src/lib/ai";
import { saveGeneratedMedia } from "../src/lib/storage";

const PASSWORD = "BuildTogether2026!";
const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY).toISOString();

function wipe() {
  const sqlite = getSqlite();
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations'")
    .all()
    .map((row) => (row as { name: string }).name);

  // Database guards (audit_logs is append-only, see db/migrations/1000) would abort this
  // destructive reset. Capture their definitions, drop them for the wipe, and put them back
  // exactly as they were — including in a finally block, so a failed seed never leaves the
  // database without its guards.
  const guards = sqlite
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL")
    .all() as { name: string; sql: string }[];
  for (const guard of guards) sqlite.exec(`DROP TRIGGER "${guard.name}"`);

  try {
    sqlite.pragma("foreign_keys = OFF");
    for (const table of tables) sqlite.exec(`DELETE FROM "${table}"`);
  } finally {
    sqlite.pragma("foreign_keys = ON");
    for (const guard of guards) sqlite.exec(guard.sql);
  }
}

/**
 * Refuse to destroy a database that is not obviously a development database.
 *
 * `NODE_ENV` alone is not a reliable signal: a staging or production database can be reached
 * with `NODE_ENV=development`, and this script deletes every row before inserting fixtures.
 * So the second gate looks at the data itself — every account created by this seed uses an
 * `@example.test` address, so any other address means real people signed up here.
 */
/** How many accounts exist in this database. Zero means nothing can be lost by seeding. */
export function accountCount(): number {
  const sqlite = getSqlite();
  const hasUsers = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (!hasUsers) return 0;
  return (sqlite.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
}

function assertSafeToWipe() {
  if (process.env.NODE_ENV === "production") {
    // A demo deployment (DEMO_MODE=1) may seed exactly once, and only while the database
    // has no accounts at all. Once anyone signs up, this refuses for the life of the volume.
    if (process.env.DEMO_MODE !== "1") {
      throw new Error(
        "db:seed refuses to run in production: it would delete real data. Set DEMO_MODE=1 only on a demonstration deployment.",
      );
    }
    if (accountCount() > 0) {
      throw new Error(
        "db:seed refuses to wipe this database: it already holds accounts, so it is no longer an empty demo deployment.",
      );
    }
    console.warn("DEMO_MODE=1: seeding demonstration data into an empty production database.");
    return;
  }
  if (process.env.SEED_ALLOW_NON_DEMO === "1") {
    console.warn("SEED_ALLOW_NON_DEMO=1: wiping a database that holds non-demo accounts.");
    return;
  }

  const sqlite = getSqlite();
  const hasUsers = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (!hasUsers) return;

  const real = sqlite
    .prepare("SELECT email FROM users WHERE email NOT LIKE '%@example.test' LIMIT 1")
    .get() as { email: string } | undefined;
  if (real) {
    throw new Error(
      `db:seed refuses to wipe this database: it contains a non-demo account (${real.email}). ` +
        "Point DATABASE_PATH at a development database, or set SEED_ALLOW_NON_DEMO=1 if you are certain.",
    );
  }
}

function coverSvg(title: string, accent: string): Buffer {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0b1220"/>
          <stop offset="100%" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="450" fill="url(#g)"/>
      <circle cx="660" cy="90" r="180" fill="#ffffff" opacity="0.05"/>
      <circle cx="120" cy="400" r="150" fill="#ffffff" opacity="0.04"/>
      <text x="56" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="120" font-weight="700" fill="#ffffff" opacity="0.92">${initials}</text>
      <text x="56" y="360" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#d5cdff">${title.replace(/[<&>]/g, "")}</text>
    </svg>`,
    "utf8",
  );
}

export async function seedDemoData() {
  // This script deletes every application row before inserting demo fixtures. It must never
  // be able to reach a database holding real accounts — see assertSafeToWipe for the gates.
  assertSafeToWipe();

  console.log("Applying migrations…");
  runMigrations();
  assertSafeToWipe();
  console.log("Clearing existing data…");
  wipe();

  const db = getDb();
  const passwordHash = hashPassword(PASSWORD);

  /* --------------------------------- people -------------------------------- */

  const people = {
    maya: "u-maya",
    jonas: "u-jonas",
    amara: "u-amara",
    leo: "u-leo",
    priya: "u-priya",
    sam: "u-sam",
    ruth: "u-ruth",
  };

  db.insert(users)
    .values([
      {
        id: people.maya,
        email: "maya@example.test",
        username: "maya_okafor",
        displayName: "Maya Okafor",
        passwordHash,
        bio: "Product designer working on civic and climate tools. I build in public and document the messy parts.",
        location: "London, UK",
        timezone: "Europe/London",
        goals: ["build_projects", "teach", "grow_audience"],
        portfolioUrls: ["https://maya.example.test"],
        emailVerifiedAt: ago(120),
        onboardingCompletedAt: ago(120),
        createdAt: ago(120),
        lastSeenAt: ago(0),
      },
      {
        id: people.jonas,
        email: "jonas@example.test",
        username: "jonas_b",
        displayName: "Jonas Berg",
        passwordHash,
        bio: "Backend engineer. Firmware, sensors and unglamorous data pipelines.",
        location: "Berlin, Germany",
        timezone: "Europe/Berlin",
        goals: ["contribute", "build_projects", "learn"],
        emailVerifiedAt: ago(110),
        onboardingCompletedAt: ago(110),
        createdAt: ago(110),
        lastSeenAt: ago(1),
      },
      {
        id: people.amara,
        email: "amara@example.test",
        username: "amara_d",
        displayName: "Amara Diallo",
        passwordHash,
        bio: "Data analyst and educator. I turn field data into things people can actually use.",
        location: "Lagos, Nigeria",
        timezone: "Africa/Lagos",
        goals: ["contribute", "teach", "learn"],
        emailVerifiedAt: ago(95),
        onboardingCompletedAt: ago(95),
        createdAt: ago(95),
        lastSeenAt: ago(0),
      },
      {
        id: people.leo,
        email: "leo@example.test",
        username: "leo_chen",
        displayName: "Leo Chen",
        passwordHash,
        bio: "Career switcher learning practical product work. Currently obsessed with accessibility.",
        location: "Singapore",
        timezone: "Asia/Singapore",
        goals: ["learn", "contribute"],
        emailVerifiedAt: ago(60),
        onboardingCompletedAt: ago(60),
        createdAt: ago(60),
        lastSeenAt: ago(2),
      },
      {
        id: people.priya,
        email: "priya@example.test",
        username: "priya_n",
        displayName: "Priya Nair",
        passwordHash,
        bio: "Runs Northwind Studio, a small product studio for community organisations.",
        location: "Bristol, UK",
        timezone: "Europe/London",
        goals: ["grow_business", "build_projects"],
        emailVerifiedAt: ago(80),
        onboardingCompletedAt: ago(80),
        createdAt: ago(80),
        lastSeenAt: ago(1),
      },
      {
        id: people.sam,
        email: "sam@example.test",
        username: "sam_admin",
        displayName: "Sam Whitfield",
        passwordHash,
        bio: "Platform operations (demonstration administrator account).",
        emailVerifiedAt: ago(130),
        onboardingCompletedAt: ago(130),
        isAdmin: true,
        createdAt: ago(130),
      },
      {
        id: people.ruth,
        email: "ruth@example.test",
        username: "ruth_mod",
        displayName: "Ruth Adeyemi",
        passwordHash,
        bio: "Community moderation (demonstration moderator account).",
        emailVerifiedAt: ago(130),
        onboardingCompletedAt: ago(130),
        isModerator: true,
        createdAt: ago(130),
      },
    ])
    .run();

  db.insert(userRoles)
    .values([
      { userId: people.maya, role: "creator" },
      { userId: people.maya, role: "educator" },
      { userId: people.maya, role: "contributor" },
      { userId: people.jonas, role: "contributor" },
      { userId: people.jonas, role: "creator" },
      { userId: people.amara, role: "contributor" },
      { userId: people.amara, role: "educator" },
      { userId: people.leo, role: "learner" },
      { userId: people.priya, role: "business" },
      { userId: people.priya, role: "creator" },
      { userId: people.sam, role: "learner" },
      { userId: people.ruth, role: "learner" },
    ])
    .run();

  db.insert(userPreferences)
    .values([
      {
        userId: people.maya,
        categories: ["sustainability", "design", "community"],
        interests: ["civic tech", "climate", "accessibility"],
        allowDirectMessages: "everyone",
      },
      {
        userId: people.jonas,
        categories: ["software", "hardware", "sustainability"],
        interests: ["sensors", "embedded", "open data"],
        allowDirectMessages: "project_members",
      },
      {
        userId: people.amara,
        categories: ["education", "research", "software"],
        interests: ["data literacy", "field research"],
        allowDirectMessages: "project_members",
      },
      { userId: people.leo, categories: ["design", "software", "education"], interests: ["accessibility", "ux"] },
      { userId: people.priya, categories: ["community", "business", "design"], interests: ["service design"] },
      { userId: people.sam, categories: [], interests: [] },
      { userId: people.ruth, categories: [], interests: [] },
    ])
    .run();

  const skillRows = [
    { id: "s-react", name: "React", slug: "react", category: "software" },
    { id: "s-ts", name: "TypeScript", slug: "typescript", category: "software" },
    { id: "s-python", name: "Python", slug: "python", category: "software" },
    { id: "s-data", name: "Data analysis", slug: "data-analysis", category: "research" },
    { id: "s-ux", name: "UX research", slug: "ux-research", category: "design" },
    { id: "s-proto", name: "Prototyping", slug: "prototyping", category: "design" },
    { id: "s-arduino", name: "Embedded hardware", slug: "embedded-hardware", category: "hardware" },
    { id: "s-facilitation", name: "Facilitation", slug: "facilitation", category: "community" },
    { id: "s-writing", name: "Technical writing", slug: "technical-writing", category: "media" },
    { id: "s-access", name: "Accessibility", slug: "accessibility", category: "design" },
    { id: "s-gis", name: "Mapping / GIS", slug: "mapping-gis", category: "research" },
    { id: "s-video", name: "Video editing", slug: "video-editing", category: "media" },
  ];
  db.insert(skills).values(skillRows.map((skill) => ({ ...skill, createdAt: ago(140) }))).run();

  db.insert(userSkills)
    .values([
      { userId: people.maya, skillId: "s-ux", level: "advanced", evidenceCount: 3 },
      { userId: people.maya, skillId: "s-proto", level: "advanced", evidenceCount: 2 },
      { userId: people.maya, skillId: "s-access", level: "intermediate", evidenceCount: 1 },
      { userId: people.jonas, skillId: "s-ts", level: "advanced", evidenceCount: 2 },
      { userId: people.jonas, skillId: "s-arduino", level: "intermediate", evidenceCount: 2 },
      { userId: people.jonas, skillId: "s-python", level: "intermediate", evidenceCount: 1 },
      { userId: people.amara, skillId: "s-data", level: "advanced", evidenceCount: 3 },
      { userId: people.amara, skillId: "s-writing", level: "intermediate", evidenceCount: 1 },
      { userId: people.leo, skillId: "s-ux", level: "beginner", evidenceCount: 0 },
      { userId: people.priya, skillId: "s-facilitation", level: "advanced", evidenceCount: 2 },
    ])
    .run();

  /* -------------------------------- business ------------------------------- */

  db.insert(businesses)
    .values({
      id: "b-northwind",
      ownerId: people.priya,
      name: "Northwind Studio",
      slug: "northwind-studio",
      description:
        "A five-person product studio working with community organisations on service design, mapping and small digital tools. Demonstration business account.",
      industry: "Design and technology",
      website: "https://northwind.example.test",
      createdAt: ago(70),
    })
    .run();
  db.insert(businessMembers)
    .values([
      { businessId: "b-northwind", userId: people.priya, role: "owner" },
      { businessId: "b-northwind", userId: people.maya, role: "admin" },
      { businessId: "b-northwind", userId: people.amara, role: "member" },
    ])
    .run();

  /* -------------------------------- projects ------------------------------- */

  const covers: Record<string, string> = {};
  for (const [key, title, accent] of [
    ["river", "River Watch", "#1d4b6e"],
    ["routes", "Quiet Routes", "#4c3b8f"],
    ["pantry", "Open Pantry", "#1f5d4c"],
    ["mend", "Mend Studio", "#6b4a2f"],
    ["air", "Neighbourhood Air Map", "#3a4f63"],
  ] as const) {
    const file = await saveGeneratedMedia({
      buffer: coverSvg(title, accent),
      filename: `${key}-cover.svg`,
      mimeType: "image/svg+xml",
      ownerId: null,
      visibility: "public",
    });
    covers[key] = file.id;
  }

  db.insert(projects)
    .values([
      {
        id: "p-river",
        ownerId: people.maya,
        name: "River Watch",
        slug: "river-watch",
        shortDescription:
          "Low-cost water-quality sensors and a public dashboard so a river trust can spot pollution events in hours, not weeks.",
        overview:
          "River Watch is a volunteer-run monitoring network for the lower Wye catchment. We are building cheap, repairable sensor nodes that log turbidity and temperature, plus a dashboard the trust can actually use. Everything is documented in public so other groups can copy the approach.",
        problem:
          "The trust currently tests four sites monthly. Pollution events are missed entirely, and residents report problems through social media with no data trail.",
        audience: "River trusts, volunteer monitoring groups, local authorities",
        category: "sustainability",
        stage: "building",
        visibility: "public",
        workMode: "hybrid",
        effort: "4–6 hours per week",
        deadline: ago(-45),
        compensationType: "unpaid",
        compensationDetails:
          "Volunteer collaboration with full credit and public documentation. Hardware costs are reimbursed with receipts. No employment relationship is implied.",
        allowPublicDocs: true,
        confidentialityNotes: "Nothing confidential — all data is public by default.",
        ipNotes: "Hardware designs released under CERN-OHL-P; dashboard code MIT.",
        links: [{ label: "Field notes (illustrative)", url: "https://example.test/river-watch-notes" }],
        coverImageId: covers.river,
        status: "published",
        publishedAt: ago(52),
        viewCount: 412,
        createdAt: ago(55),
      },
      {
        id: "p-routes",
        ownerId: people.amara,
        name: "Quiet Routes",
        slug: "quiet-routes",
        shortDescription:
          "An accessibility-first walking route planner that prioritises low-sensory-stress streets over the fastest path.",
        overview:
          "Quiet Routes maps noise, crowding and pavement quality so people who find busy streets overwhelming can plan calmer journeys. Currently a tested prototype with 30 participants.",
        problem:
          "Existing route planners optimise for speed. For autistic and anxious walkers, the fastest route is often unusable.",
        audience: "Autistic adults, people with anxiety, carers, occupational therapists",
        category: "design",
        stage: "prototype",
        visibility: "public",
        workMode: "remote",
        effort: "3–5 hours per week",
        deadline: ago(-30),
        compensationType: "unpaid",
        compensationDetails: "Volunteer project. Credit, reference and shared authorship on published work.",
        allowPublicDocs: true,
        coverImageId: covers.routes,
        status: "published",
        publishedAt: ago(38),
        viewCount: 268,
        createdAt: ago(41),
      },
      {
        id: "p-pantry",
        ownerId: people.maya,
        businessId: "b-northwind",
        name: "Open Pantry",
        slug: "open-pantry",
        shortDescription:
          "A surplus-food coordination tool used by three community kitchens to stop good food being binned.",
        overview:
          "Open Pantry started as a spreadsheet and is now a small web app used by three kitchens in Bristol. It tracks surplus offers from local shops and matches them to meal plans.",
        problem: "Surplus food is time-critical. WhatsApp groups lose track of what is available and when it expires.",
        audience: "Community kitchens, food banks, small retailers",
        category: "community",
        stage: "launched",
        visibility: "public",
        workMode: "local",
        effort: "2 hours per week",
        deadline: null,
        compensationType: "revenue_share",
        compensationDetails:
          "Any surplus revenue from support contracts is shared with contributors under a written agreement. Nothing has been earned yet — the tool is free for the kitchens.",
        allowPublicDocs: true,
        coverImageId: covers.pantry,
        status: "published",
        publishedAt: ago(90),
        viewCount: 531,
        createdAt: ago(94),
      },
      {
        id: "p-mend",
        ownerId: people.priya,
        businessId: "b-northwind",
        name: "Mend Studio",
        slug: "mend-studio",
        shortDescription:
          "A repair-first product studio brand and service model for small electronics. Currently invite-only while we test pricing.",
        overview:
          "Exploratory work on a repair service that pays technicians properly and publishes repair guides for everything it fixes.",
        problem: "Repair is cheaper and greener than replacement but almost impossible to book reliably.",
        audience: "Households, repair technicians, local high streets",
        category: "business",
        stage: "idea",
        visibility: "invite_only",
        workMode: "local",
        effort: "6 hours per week",
        deadline: null,
        compensationType: "negotiable",
        compensationDetails: "We are exploring a paid pilot. No terms agreed and nothing committed.",
        allowPublicDocs: false,
        coverImageId: covers.mend,
        status: "published",
        publishedAt: ago(18),
        viewCount: 74,
        createdAt: ago(20),
      },
      {
        id: "p-air",
        ownerId: people.jonas,
        name: "Neighbourhood Air Map",
        slug: "neighbourhood-air-map",
        shortDescription:
          "Research into turning low-cost air-quality readings into something a residents' association can act on.",
        overview:
          "Mostly a research project right now: comparing sensor accuracy, and interviewing residents about what they would do differently with better data.",
        problem: "Air-quality data exists but is presented at a scale and in a language that residents cannot use.",
        audience: "Residents' associations, schools, public health teams",
        category: "research",
        stage: "research",
        visibility: "public",
        workMode: "remote",
        effort: "2 hours per week",
        deadline: null,
        compensationType: "unpaid",
        compensationDetails: "Research collaboration with co-authorship on the write-up.",
        allowPublicDocs: true,
        coverImageId: covers.air,
        status: "published",
        publishedAt: ago(12),
        viewCount: 96,
        createdAt: ago(14),
      },
    ])
    .run();

  db.insert(projectSkills)
    .values([
      { projectId: "p-river", skillId: "s-arduino" },
      { projectId: "p-river", skillId: "s-python" },
      { projectId: "p-river", skillId: "s-ux" },
      { projectId: "p-river", skillId: "s-writing" },
      { projectId: "p-routes", skillId: "s-ux" },
      { projectId: "p-routes", skillId: "s-access" },
      { projectId: "p-routes", skillId: "s-proto" },
      { projectId: "p-pantry", skillId: "s-react" },
      { projectId: "p-pantry", skillId: "s-facilitation" },
      { projectId: "p-mend", skillId: "s-facilitation" },
      { projectId: "p-air", skillId: "s-data" },
      { projectId: "p-air", skillId: "s-gis" },
    ])
    .run();

  db.insert(projectMembers)
    .values([
      { projectId: "p-river", userId: people.maya, role: "owner", title: "Project lead", status: "active", joinedAt: ago(55) },
      { projectId: "p-river", userId: people.jonas, role: "collaborator", title: "Hardware and data", status: "active", joinedAt: ago(48) },
      { projectId: "p-river", userId: people.amara, role: "collaborator", title: "Field research", status: "active", joinedAt: ago(40) },
      { projectId: "p-routes", userId: people.amara, role: "owner", title: "Project lead", status: "active", joinedAt: ago(41) },
      { projectId: "p-routes", userId: people.leo, role: "collaborator", title: "Research support", status: "active", joinedAt: ago(25) },
      { projectId: "p-pantry", userId: people.maya, role: "owner", title: "Product", status: "active", joinedAt: ago(94) },
      { projectId: "p-pantry", userId: people.priya, role: "admin", title: "Studio partner", status: "active", joinedAt: ago(90) },
      { projectId: "p-mend", userId: people.priya, role: "owner", title: "Studio founder", status: "active", joinedAt: ago(20) },
      { projectId: "p-air", userId: people.jonas, role: "owner", title: "Researcher", status: "active", joinedAt: ago(14) },
    ])
    .run();

  db.insert(projectMilestones)
    .values([
      { projectId: "p-river", title: "Working sensor prototype", description: "Two nodes logging turbidity and temperature for a week without failure.", status: "completed", orderIndex: 0, dueDate: ago(30), completedAt: ago(21) },
      { projectId: "p-river", title: "Dashboard alpha with the trust", description: "Trust staff can see the last 24 hours at a glance.", status: "completed", orderIndex: 1, dueDate: ago(10), completedAt: ago(6) },
      { projectId: "p-river", title: "Field guide published", description: "Public guide so other groups can build the same kit.", status: "in_progress", orderIndex: 2, dueDate: ago(-20) },
      { projectId: "p-routes", title: "30 participant study complete", status: "completed", orderIndex: 0, completedAt: ago(14) },
      { projectId: "p-routes", title: "Quietness scoring model v2", status: "in_progress", orderIndex: 1, dueDate: ago(-12) },
      { projectId: "p-pantry", title: "Three kitchens live", status: "completed", orderIndex: 0, completedAt: ago(55) },
      { projectId: "p-air", title: "Sensor accuracy comparison", status: "pending", orderIndex: 0 },
    ])
    .run();

  /* ---------------------------------- tasks -------------------------------- */

  db.insert(tasks)
    .values([
      {
        id: "t-housing",
        projectId: "p-river",
        createdBy: people.maya,
        title: "Prototype a repairable sensor housing",
        description:
          "Design and build a housing for the turbidity sensor that a volunteer can open and repair with a screwdriver. Must survive a British winter and cost under £12 in parts.",
        objective: "Prove the housing is buildable by a non-specialist in under 30 minutes.",
        deliverablesSpec: "CAD files, a bill of materials, assembly photos and a short build guide.",
        acceptanceCriteria:
          "1) Assembly under 30 minutes with common tools. 2) Parts under £12. 3) Water ingress test passed for 72 hours. 4) Files published in the repo.",
        status: "completed",
        effort: "8–10 hours",
        deadline: ago(22),
        compensationType: "unpaid",
        compensationDetails: "Volunteer task; parts reimbursed with receipts, full credit in the field guide.",
        visibility: "public",
        publishedAt: ago(48),
        createdAt: ago(50),
      },
      {
        id: "t-dashboard",
        projectId: "p-river",
        createdBy: people.maya,
        title: "Build the readings dashboard (alpha)",
        description:
          "A small dashboard showing the last 24 hours of readings per site, with an obvious visual flag when a reading looks wrong. Needs to work on a phone in the field.",
        objective: "Give trust staff a single screen they can check each morning.",
        deliverablesSpec: "Working dashboard connected to the sample dataset, plus a one-page operating note.",
        acceptanceCriteria:
          "1) Loads in under 2s on a mid-range phone. 2) Clearly marks stale or implausible readings. 3) Keyboard navigable. 4) Meets WCAG AA contrast.",
        status: "open",
        effort: "12–15 hours",
        deadline: ago(-18),
        compensationType: "unpaid",
        compensationDetails: "Volunteer task with public credit and a written reference on completion.",
        visibility: "public",
        publishedAt: ago(30),
        createdAt: ago(32),
      },
      {
        id: "t-calibration",
        projectId: "p-river",
        createdBy: people.maya,
        title: "Field calibration notes for the first two nodes",
        description:
          "Take the two prototype nodes to the four existing test sites and document how readings compare with the trust's reference meter.",
        objective: "Understand how far we can trust the cheap sensors before publishing any numbers.",
        deliverablesSpec: "A comparison table, photos of each install, and a note on anything that surprised us.",
        acceptanceCriteria: "All four sites visited, comparison table complete, limitations stated plainly.",
        status: "in_progress",
        effort: "6 hours",
        deadline: ago(-6),
        compensationType: "unpaid",
        compensationDetails: "Volunteer task; travel costs reimbursed.",
        visibility: "private",
        confidentiality: "Contains site access details — keep team-only until the trust approves publication.",
        publishedAt: ago(25),
        createdAt: ago(26),
      },
      {
        id: "t-fieldguide",
        projectId: "p-river",
        createdBy: people.maya,
        title: "Write the public field guide",
        description: "Turn the housing and calibration work into a guide another river group could follow.",
        objective: "A group with no electronics experience should be able to order parts and build a node.",
        acceptanceCriteria: "Parts list with UK suppliers, step-by-step build, calibration caveats, licence statement.",
        status: "draft",
        effort: "10 hours",
        compensationType: "unpaid",
        compensationDetails: "Volunteer writing task with public authorship.",
        visibility: "public",
        createdAt: ago(9),
      },
      {
        id: "t-quiet-scoring",
        projectId: "p-routes",
        createdBy: people.amara,
        title: "Validate the quietness scoring model v2",
        description: "Compare v2 scores against participant ratings from the 30-person study and report the differences.",
        objective: "Decide whether v2 is good enough to ship to the next cohort.",
        deliverablesSpec: "Analysis notebook, a short summary of disagreements, and a recommendation.",
        acceptanceCriteria: "All 30 routes scored, disagreements listed, recommendation stated with reasoning.",
        status: "reviewing_interest",
        effort: "8 hours",
        deadline: ago(-14),
        compensationType: "unpaid",
        compensationDetails: "Volunteer research task with co-authorship on the published write-up.",
        visibility: "public",
        publishedAt: ago(16),
        createdAt: ago(17),
      },
      {
        id: "t-pantry-onboarding",
        projectId: "p-pantry",
        createdBy: people.maya,
        title: "Kitchen onboarding checklist",
        description: "A printable checklist the team can use when a new kitchen joins.",
        acceptanceCriteria: "Covers accounts, stock categories, volunteer roles and what to do when something breaks.",
        status: "completed",
        effort: "4 hours",
        compensationType: "unpaid",
        compensationDetails: "Volunteer task with credit.",
        visibility: "public",
        publishedAt: ago(60),
        createdAt: ago(62),
      },
    ])
    .run();

  db.insert(taskSkills)
    .values([
      { taskId: "t-housing", skillId: "s-arduino" },
      { taskId: "t-dashboard", skillId: "s-react" },
      { taskId: "t-dashboard", skillId: "s-access" },
      { taskId: "t-calibration", skillId: "s-data" },
      { taskId: "t-fieldguide", skillId: "s-writing" },
      { taskId: "t-quiet-scoring", skillId: "s-data" },
      { taskId: "t-pantry-onboarding", skillId: "s-facilitation" },
    ])
    .run();

  db.insert(taskAssignments)
    .values([
      {
        taskId: "t-housing",
        userId: people.jonas,
        assignedBy: people.maya,
        status: "active",
        responsibilities: "Design, build and document the housing; publish files.",
        scopeConfirmedAt: ago(47),
        assignedAt: ago(48),
      },
      {
        taskId: "t-calibration",
        userId: people.amara,
        assignedBy: people.maya,
        status: "active",
        responsibilities: "Visit four sites, record comparison data, document limitations.",
        scopeConfirmedAt: ago(24),
        assignedAt: ago(25),
      },
      {
        taskId: "t-pantry-onboarding",
        userId: people.amara,
        assignedBy: people.maya,
        status: "active",
        scopeConfirmedAt: ago(61),
        assignedAt: ago(62),
      },
    ])
    .run();

  db.insert(expressionsOfInterest)
    .values([
      {
        id: "eoi-leo-dashboard",
        projectId: "p-river",
        taskId: "t-dashboard",
        userId: people.leo,
        intent: "help_task",
        message:
          "I have been building React dashboards in my current job for a year and I would like to work on something with a real accessibility bar. I have not done field data before — happy to be reviewed closely.",
        workSamples: [{ label: "Portfolio", url: "https://leo.example.test/work" }],
        status: "new",
        createdAt: ago(4),
      },
      {
        id: "eoi-leo-routes",
        projectId: "p-routes",
        userId: people.leo,
        intent: "join_team",
        message: "I am autistic and use route planners daily. I would like to help with research interviews.",
        status: "accepted",
        reviewedBy: people.amara,
        responseMessage: "Welcome aboard — I have added you to the research rota. Start with the interview guide.",
        respondedAt: ago(24),
        createdAt: ago(26),
      },
      {
        id: "eoi-jonas-air",
        projectId: "p-air",
        userId: people.amara,
        intent: "contribute",
        message: "I have calibration data from a similar comparison that might save you a month of work.",
        status: "reviewing",
        createdAt: ago(3),
      },
    ])
    .run();

  db.insert(taskSubmissions)
    .values([
      {
        id: "sub-housing",
        taskId: "t-housing",
        userId: people.jonas,
        note: "Housing built and tested. Bill of materials came to £10.40. Assembly takes about 22 minutes with a screwdriver and a 10mm spanner. 72-hour ingress test passed; the cable gland was the weak point first time round and I changed the design.",
        status: "accepted",
        reviewerId: people.maya,
        reviewNote: "Accepted. The design is genuinely repairable and the guide is usable. Gland change documented — thank you.",
        submittedAt: ago(23),
        reviewedAt: ago(21),
      },
      {
        id: "sub-pantry",
        taskId: "t-pantry-onboarding",
        userId: people.amara,
        note: "Checklist tested with the Easton kitchen. Two steps were ambiguous (stock categories and the escalation route) — both fixed.",
        status: "accepted",
        reviewerId: people.maya,
        reviewNote: "Accepted after the second revision.",
        submittedAt: ago(57),
        reviewedAt: ago(55),
      },
    ])
    .run();

  db.insert(deliverables)
    .values([
      { taskId: "t-housing", submissionId: "sub-housing", title: "Housing CAD files", description: "STEP and Fusion 360 source for the enclosure.", url: "https://example.test/river-watch/cad", approved: true, createdAt: ago(23) },
      { taskId: "t-housing", submissionId: "sub-housing", title: "Assembly guide (2 pages)", description: "Printable guide with photos.", url: "https://example.test/river-watch/assembly", approved: true, createdAt: ago(23) },
      { taskId: "t-pantry-onboarding", submissionId: "sub-pantry", title: "Kitchen onboarding checklist v2", description: "Printable checklist used by three kitchens.", url: "https://example.test/open-pantry/checklist", approved: true, createdAt: ago(57) },
    ])
    .run();

  db.insert(taskReviews)
    .values([
      { taskId: "t-housing", submissionId: "sub-housing", reviewerId: people.maya, decision: "accepted", reason: "Meets all four acceptance criteria; repairability tested by a volunteer.", createdAt: ago(21) },
      { taskId: "t-pantry-onboarding", submissionId: "sub-pantry", reviewerId: people.maya, decision: "accepted", reason: "Tested with a real kitchen after one revision.", createdAt: ago(55) },
    ])
    .run();

  db.insert(contributorAttributions)
    .values([
      {
        id: "attr-jonas-housing",
        userId: people.jonas,
        projectId: "p-river",
        taskId: "t-housing",
        submissionId: "sub-housing",
        role: "Hardware and documentation",
        summary: "Designed and built the repairable sensor housing and wrote the assembly guide.",
        verificationMethod: "owner_confirmed",
        status: "confirmed",
        evidence: "Accepted submission sub-housing; reviewer Maya Okafor (project owner).",
        confirmedBy: people.maya,
        confirmedAt: ago(21),
        createdAt: ago(21),
      },
      {
        id: "attr-amara-pantry",
        userId: people.amara,
        projectId: "p-pantry",
        taskId: "t-pantry-onboarding",
        submissionId: "sub-pantry",
        role: "Service design",
        summary: "Wrote and tested the kitchen onboarding checklist with the Easton kitchen.",
        verificationMethod: "owner_confirmed",
        status: "confirmed",
        evidence: "Accepted submission sub-pantry; reviewer Maya Okafor.",
        confirmedBy: people.maya,
        confirmedAt: ago(55),
        createdAt: ago(55),
      },
    ])
    .run();

  /* -------------------------------- work log ------------------------------- */

  db.insert(workLogEntries)
    .values([
      {
        taskId: "t-housing",
        authorId: people.jonas,
        kind: "note",
        title: "Starting point: what actually breaks",
        body: "I asked two volunteers what fails on outdoor kit. Both said the same thing: water gets in at the cable entry, and then the connector corrodes. So the housing is really a cable-gland problem with a box around it.",
        visibility: "public",
        approvedBy: people.maya,
        approvedAt: ago(44),
        createdAt: ago(45),
      },
      {
        taskId: "t-housing",
        authorId: people.jonas,
        kind: "experiment",
        title: "First ingress test failed (and why that was useful)",
        body: "Version 1 passed a splash test and failed a 72-hour soak at the cable gland. I had used a plain grommet. Switched to an M12 gland with a silicone washer and repeated the test — dry inside. Photographed the failure so the guide includes it rather than pretending the first design worked.",
        visibility: "public",
        approvedBy: people.maya,
        approvedAt: ago(41),
        createdAt: ago(42),
      },
      {
        taskId: "t-housing",
        authorId: people.jonas,
        kind: "decision",
        title: "Decision: keep screws, reject press-fit",
        body: "A press-fit lid would be cheaper and faster to make. We rejected it because the whole point is repairability: a volunteer with a screwdriver in a wet field should be able to open it. Cost difference was 60p.",
        visibility: "public",
        approvedBy: people.maya,
        approvedAt: ago(40),
        createdAt: ago(41),
      },
      {
        taskId: "t-housing",
        authorId: people.jonas,
        kind: "lesson",
        title: "What I would tell the next person",
        body: "Test the boring failure mode first. We spent a week on the sensor mount and the thing that actually leaked was a £2 gland. Buy three of every consumable; you will break one.",
        visibility: "public",
        approvedBy: people.maya,
        approvedAt: ago(35),
        createdAt: ago(36),
      },
      {
        taskId: "t-calibration",
        authorId: people.amara,
        kind: "note",
        title: "Site visit 1 — Wye bridge",
        body: "Reference meter read 4.2 NTU; node A read 5.8. Node B read 4.6. Both nodes consistently high, which suggests a calibration offset rather than noise. Two more visits needed before we publish anything.",
        visibility: "team",
        createdAt: ago(8),
      },
      {
        taskId: "t-calibration",
        authorId: people.amara,
        kind: "challenge",
        title: "Access problem at site 3",
        body: "The landowner has changed and we no longer have permission to access the bank. I have paused that site rather than trespass. Needs a conversation with the trust before we continue.",
        visibility: "team",
        createdAt: ago(5),
      },
      {
        taskId: "t-calibration",
        authorId: people.amara,
        kind: "note",
        title: "Preliminary calibration comparison",
        body: "Across three accessible sites the cheap nodes read 0.9–1.6 NTU higher than the reference meter. That is usable for spotting relative change, not for absolute reporting. I will state that limitation in the public summary.",
        visibility: "public_pending",
        createdAt: ago(2),
      },
    ])
    .run();

  /* ------------------------------ updates & feed --------------------------- */

  db.insert(projectUpdates)
    .values([
      {
        id: "upd-river-1",
        projectId: "p-river",
        authorId: people.maya,
        title: "The housing works, and the guide is nearly ready",
        body: "Jonas's housing design passed a 72-hour soak test after one failed attempt (documented, not hidden). We are now writing the field guide so another river group can copy the whole thing. If you have built outdoor sensor kit before, I would love a critical read of the guide before it goes out.",
        visibility: "public",
        createdAt: ago(21),
      },
      {
        id: "upd-river-2",
        projectId: "p-river",
        authorId: people.maya,
        title: "Dashboard alpha is open for a contributor",
        body: "We need someone to build the readings dashboard — the acceptance criteria are deliberately strict about accessibility and stale data. This is unpaid volunteer work with public credit; if that does not work for you, that is completely reasonable and I would rather you say so.",
        visibility: "public",
        createdAt: ago(30),
      },
      {
        id: "upd-routes-1",
        projectId: "p-routes",
        authorId: people.amara,
        title: "30 participants, and a scoring model that needs work",
        body: "The study is complete. Our v1 quietness score disagreed with participants on 9 of 30 routes, mostly where pavement width mattered more than traffic. v2 is now under test. Leo has joined to help with interviews.",
        visibility: "public",
        createdAt: ago(14),
      },
    ])
    .run();

  const postRows = [
    {
      id: "post-1",
      authorId: people.maya,
      projectId: "p-river",
      kind: "project_update" as const,
      body: "The sensor housing passed a 72-hour soak test on the second attempt. The first failed at a £2 cable gland — we published the failure too, because that is the bit that helps the next person.\n\nFull write-up is in the project progress tab.",
      createdAt: ago(21),
    },
    {
      id: "post-2",
      authorId: people.jonas,
      projectId: "p-river",
      taskId: "t-housing",
      kind: "lesson" as const,
      body: "Lesson from River Watch: test the boring failure mode first. We spent a week perfecting the sensor mount; the thing that actually leaked was the cable entry.",
      createdAt: ago(35),
    },
    {
      id: "post-3",
      authorId: people.amara,
      projectId: "p-routes",
      kind: "question" as const,
      body: "Accessibility folks: when a route planner says a street is 'quiet', what would make you trust that claim? We are deciding whether to show the raw inputs or only a score.",
      createdAt: ago(11),
    },
    {
      id: "post-4",
      authorId: people.priya,
      projectId: "p-pantry",
      kind: "milestone" as const,
      body: "Open Pantry is now used by three kitchens. Still free, still a spreadsheet with delusions of grandeur underneath. The onboarding checklist from Amara is the reason it scaled without a support queue.",
      createdAt: ago(48),
    },
    {
      id: "post-5",
      authorId: people.leo,
      projectId: "p-routes",
      kind: "general" as const,
      body: "First week on Quiet Routes: I ran four interviews and learned more about route planning than in six months of reading about it. The most useful question was 'when did you last abandon a journey?' — everything useful came after that.",
      createdAt: ago(9),
    },
    {
      id: "post-6",
      authorId: people.amara,
      projectId: "p-river",
      kind: "general" as const,
      body: "Calibration update: our cheap nodes read 0.9–1.6 NTU higher than the reference meter across three sites. Good enough for spotting change, not good enough for absolute reporting. Publishing the limitation is the whole point.",
      createdAt: ago(2),
    },
    {
      id: "post-7",
      authorId: people.jonas,
      projectId: "p-air",
      kind: "general" as const,
      body: "Comparing three cheap air-quality sensors this month. Early finding: two of them agree with each other precisely and are both consistently wrong. Agreement is not accuracy.",
      createdAt: ago(6),
    },
    {
      id: "post-8",
      authorId: people.maya,
      projectId: "p-river",
      kind: "milestone" as const,
      body: "Milestone reached: trust staff checked the alpha dashboard every morning for a week without being asked. That is the first real sign the thing is useful.",
      createdAt: ago(6),
    },
  ];
  db.insert(posts).values(postRows).run();

  db.insert(comments)
    .values([
      {
        id: "c-1",
        authorId: people.leo,
        targetType: "post",
        targetId: "post-3",
        body: "Raw inputs, please. A score I cannot inspect is a score I will not trust — especially on a bad day when I need to decide fast.",
        createdAt: ago(10),
      },
      {
        id: "c-2",
        authorId: people.amara,
        targetType: "post",
        targetId: "post-3",
        parentId: "c-1",
        body: "That is exactly the tension. We are trialling 'score plus the three inputs that moved it most' — would that be enough?",
        createdAt: ago(10),
      },
      {
        id: "c-3",
        authorId: people.priya,
        targetType: "post",
        targetId: "post-1",
        body: "Publishing the failed attempt is the most useful part of this. We are stealing this approach for our repair guides.",
        createdAt: ago(20),
      },
      {
        id: "c-4",
        authorId: people.jonas,
        targetType: "post",
        targetId: "post-6",
        body: "Worth adding the temperature drift too — we saw about 0.3 NTU between morning and afternoon on the same node.",
        createdAt: ago(1),
      },
    ])
    .run();

  db.insert(reactions)
    .values([
      { userId: people.jonas, targetType: "post", targetId: "post-1", kind: "celebrate" },
      { userId: people.amara, targetType: "post", targetId: "post-1", kind: "like" },
      { userId: people.priya, targetType: "post", targetId: "post-1", kind: "like" },
      { userId: people.leo, targetType: "post", targetId: "post-2", kind: "insight" },
      { userId: people.maya, targetType: "post", targetId: "post-3", kind: "like" },
      { userId: people.leo, targetType: "post", targetId: "post-4", kind: "celebrate" },
      { userId: people.maya, targetType: "post", targetId: "post-5", kind: "celebrate" },
    ])
    .run();

  db.insert(follows)
    .values([
      { followerId: people.leo, followeeId: people.maya, createdAt: ago(40) },
      { followerId: people.leo, followeeId: people.amara, createdAt: ago(25) },
      { followerId: people.jonas, followeeId: people.maya, createdAt: ago(45) },
      { followerId: people.amara, followeeId: people.maya, createdAt: ago(30) },
      { followerId: people.maya, followeeId: people.jonas, createdAt: ago(44) },
      { followerId: people.priya, followeeId: people.maya, createdAt: ago(60) },
      { followerId: people.leo, followeeId: people.jonas, createdAt: ago(20) },
    ])
    .run();

  db.insert(projectFollows)
    .values([
      { projectId: "p-river", userId: people.leo, createdAt: ago(30) },
      { projectId: "p-river", userId: people.priya, createdAt: ago(25) },
      { projectId: "p-river", userId: people.amara, createdAt: ago(40) },
      { projectId: "p-routes", userId: people.leo, createdAt: ago(28) },
      { projectId: "p-pantry", userId: people.leo, createdAt: ago(15) },
      { projectId: "p-pantry", userId: people.priya, createdAt: ago(50) },
      { projectId: "p-air", userId: people.amara, createdAt: ago(5) },
    ])
    .run();

  db.insert(savedItems)
    .values([
      { userId: people.leo, targetType: "post", targetId: "post-2" },
      { userId: people.leo, targetType: "project", targetId: "p-river" },
      { userId: people.maya, targetType: "post", targetId: "post-3" },
      { userId: people.amara, targetType: "post", targetId: "post-7" },
    ])
    .run();

  db.insert(projectInvitations)
    .values([
      {
        projectId: "p-mend",
        inviterId: people.priya,
        inviteeId: people.maya,
        role: "admin",
        message: "You have done the brand thinking for two similar services — would you help shape this one?",
        status: "pending",
        createdAt: ago(3),
      },
    ])
    .run();

  db.insert(blockedUsers).values([{ blockerId: people.leo, blockedId: people.ruth, createdAt: ago(4) }]).run();

  /* -------------------------------- learning ------------------------------- */

  db.insert(learningJourneys)
    .values({
      id: "j-river",
      projectId: "p-river",
      taskId: "t-housing",
      creatorId: people.jonas,
      title: "How we built a repairable sensor housing",
      summary:
        "A practical journey through the constraints, the failed water test and the decision to keep screws instead of press-fit — built only from the project's approved documentation.",
      status: "published",
      visibility: "public",
      publishedAt: ago(19),
      createdAt: ago(20),
    })
    .run();

  db.insert(learningJourneySteps)
    .values([
      {
        journeyId: "j-river",
        orderIndex: 0,
        title: "The real problem was the cable entry",
        body: "Two volunteers independently said the same failure mode: water gets in at the cable entry and the connector corrodes. Reframing the task from 'make a box' to 'solve the gland' changed the design.",
        kind: "context",
        sourceType: "work_log",
        sourceId: null,
        createdAt: ago(20),
      },
      {
        journeyId: "j-river",
        orderIndex: 1,
        title: "The first test failed — and we kept the photos",
        body: "A grommet passed a splash test and failed a 72-hour soak. Switching to an M12 gland with a silicone washer fixed it. Documenting the failure is what makes the guide useful to someone else.",
        kind: "experiment",
        sourceType: "work_log",
        sourceId: null,
        createdAt: ago(19),
      },
      {
        journeyId: "j-river",
        orderIndex: 2,
        title: "Repairability beat a 60p saving",
        body: "Press-fit would have been faster to make. It was rejected because a volunteer in a wet field needs to open the housing with a screwdriver. The trade-off was explicitly recorded at the time.",
        kind: "decision",
        sourceType: "work_log",
        sourceId: null,
        createdAt: ago(19),
      },
      {
        journeyId: "j-river",
        orderIndex: 3,
        title: "What this changes about how you test hardware",
        body: "Test the boring failure mode first, and buy spares of every consumable. This is the lesson the contributor recorded at the end of the task.",
        kind: "lesson",
        sourceType: "work_log",
        sourceId: null,
        createdAt: ago(19),
      },
    ])
    .run();

  db.insert(learningResources)
    .values([
      {
        id: "r-fieldguide",
        creatorId: people.jonas,
        projectId: "p-river",
        taskId: "t-housing",
        journeyId: "j-river",
        title: "Building a £10 water-quality sensor housing",
        slug: "water-quality-sensor-housing",
        summary:
          "The full build, including the failed water test, the parts list and the trade-off between cheap and repairable.",
        body: "This guide walks through the housing we actually built, not a tidied-up version.\n\n## Parts\nAn M12 cable gland with a silicone washer, a 100mm IP66 enclosure, four stainless screws, a desiccant sachet and the sensor board.\n\n## Assembly\nDrill the gland hole first. Fit the gland before the board — reaching inside afterwards is the mistake everyone makes.\n\n## The failure\nOur first version used a plain grommet. It passed a splash test and failed a 72-hour soak. The guide includes the failure photos because they are more instructive than the success.\n\n## Limitations\nThis housing is for turbidity and temperature only. It is not rated for submersion beyond 1m, and the gland needs replacing every 18 months.",
        topic: "hardware",
        level: "intermediate",
        format: "article",
        durationMinutes: 25,
        priceCents: 0,
        status: "published",
        publishedAt: ago(18),
        coverImageId: covers.river,
        transcript: null,
        createdAt: ago(19),
        viewCount: 184,
      },
      {
        id: "r-story",
        creatorId: people.maya,
        projectId: "p-river",
        title: "River Watch: the build story",
        slug: "river-watch-build-story",
        summary: "An animated walkthrough of the River Watch housing milestone, told from the documented record.",
        body: "An animated explainer generated from approved project documentation. Every scene links back to the record it came from.",
        previewBody: "Watch how a failed water test became the most useful part of the project.",
        topic: "sustainability",
        level: "beginner",
        format: "story",
        durationMinutes: 4,
        priceCents: 0,
        status: "published",
        publishedAt: ago(17),
        coverImageId: covers.river,
        createdAt: ago(17),
      },
      {
        id: "r-course",
        creatorId: people.amara,
        projectId: "p-river",
        title: "Field data for community projects",
        slug: "field-data-for-community-projects",
        summary:
          "A practical course on collecting data you can defend: calibration, limitations, consent and presenting uncertainty honestly.",
        body: "## Who this is for\nVolunteers and small teams collecting environmental or community data without a research budget.\n\n## What you will be able to do\nDesign a simple collection protocol, calibrate against a reference, state limitations plainly, and present findings without overclaiming.",
        previewBody:
          "Lesson 1 is free: why 'agreement is not accuracy' is the most important sentence in community data work.",
        topic: "research",
        level: "intermediate",
        format: "course",
        durationMinutes: 95,
        priceCents: 2400,
        status: "published",
        publishedAt: ago(14),
        coverImageId: covers.routes,
        createdAt: ago(15),
      },
      {
        id: "r-accessibility",
        creatorId: people.leo,
        projectId: "p-routes",
        title: "Five accessibility checks before you show a prototype to anyone",
        slug: "five-accessibility-checks",
        summary: "The cheap checks that catch most of the embarrassing problems before real users see them.",
        body: "## 1. Keyboard only\nPut your mouse away and try to complete the main task. If you get stuck, a keyboard user will too.\n\n## 2. Zoom to 200%\nNothing should overlap or disappear.\n\n## 3. Contrast\nBody text needs 4.5:1. Placeholder text is still text.\n\n## 4. Focus visibility\nTab through and watch for the focus ring. Removing it is not a design decision, it is a bug.\n\n## 5. Reduced motion\nTurn it on at the OS level and check nothing essential depends on animation.",
        topic: "accessibility",
        level: "beginner",
        format: "article",
        durationMinutes: 12,
        priceCents: 0,
        status: "published",
        publishedAt: ago(5),
        coverImageId: covers.routes,
        createdAt: ago(6),
      },
    ])
    .run();

  db.insert(courses).values({ id: "course-field", resourceId: "r-course", title: "Field data for community projects" }).run();
  db.insert(courseModules)
    .values([
      { id: "mod-1", courseId: "course-field", title: "Collecting data you can defend", orderIndex: 0 },
      { id: "mod-2", courseId: "course-field", title: "Communicating uncertainty", orderIndex: 1 },
    ])
    .run();
  db.insert(lessons)
    .values([
      {
        id: "lesson-1",
        moduleId: "mod-1",
        title: "Why agreement is not accuracy",
        body: "Two sensors that agree precisely can still both be wrong. Calibration is the only thing that separates them. We use the River Watch calibration data as the worked example: our cheap nodes agreed with each other within 0.1 NTU and were both 1.2 NTU off the reference.",
        orderIndex: 0,
        isFreePreview: true,
        durationMinutes: 18,
      },
      {
        id: "lesson-2",
        moduleId: "mod-1",
        title: "Designing a collection protocol",
        body: "A protocol is what lets someone else repeat your work. Minimum viable protocol: what you measure, with what, where, how often, and what you do when something is missing.",
        orderIndex: 1,
        durationMinutes: 24,
      },
      {
        id: "lesson-3",
        moduleId: "mod-2",
        title: "Stating limitations without undermining yourself",
        body: "Write the limitation as a sentence a busy reader can act on: 'Good for spotting relative change, not for absolute reporting.' That is more useful than a paragraph of hedges.",
        orderIndex: 0,
        durationMinutes: 21,
      },
      {
        id: "lesson-4",
        moduleId: "mod-2",
        title: "Presenting uncertainty to non-specialists",
        body: "Show a range, not a false decimal point. Annotate the one thing that changed. Say what you would do differently next time.",
        orderIndex: 1,
        durationMinutes: 32,
      },
    ])
    .run();
  db.insert(exercises)
    .values([
      {
        lessonId: "lesson-1",
        title: "Spot the false confidence",
        instructions:
          "Find a public data claim with a precise number and no stated method. Write the two questions you would ask before trusting it.",
      },
      {
        lessonId: "lesson-3",
        title: "Rewrite a limitation",
        instructions: "Take your last project and rewrite its biggest limitation as one actionable sentence.",
      },
    ])
    .run();

  db.insert(creatorProducts)
    .values({
      id: "prod-field-data",
      creatorId: people.amara,
      resourceId: "r-course",
      title: "Field data for community projects",
      description:
        "A practical, four-lesson course built from real fieldwork on the River Watch project. Includes the calibration notebook template and the limitation-writing exercise.",
      curriculum: [
        { title: "Collecting data you can defend", minutes: 42 },
        { title: "Communicating uncertainty", minutes: 53 },
      ],
      priceCents: 2400,
      currency: "GBP",
      refundPolicy: "Refunds within 14 days if you have completed less than half the course. Request from the creator.",
      format: "course",
      status: "published",
      createdAt: ago(13),
    })
    .run();

  // Access is granted directly (payments are disabled in this build).
  db.insert(orders)
    .values({
      id: "order-leo",
      buyerId: people.leo,
      productId: "prod-field-data",
      amountCents: 2400,
      currency: "GBP",
      status: "access_granted",
      method: "dev_fixture",
      note: "Seeded demonstration of a granted entitlement. No payment was processed.",
      createdAt: ago(10),
    })
    .run();
  db.insert(orderItems)
    .values({ orderId: "order-leo", productId: "prod-field-data", title: "Field data for community projects", amountCents: 2400 })
    .run();
  db.insert(entitlements)
    .values({
      id: "ent-leo",
      userId: people.leo,
      productId: "prod-field-data",
      resourceId: "r-course",
      source: "dev_fixture",
      orderId: "order-leo",
      grantedBy: people.amara,
      grantedAt: ago(10),
    })
    .run();

  db.insert(learningProgress)
    .values([
      { userId: people.leo, resourceId: "r-course", lessonId: "lesson-1", completed: true, progressPct: 25, updatedAt: ago(2) },
      { userId: people.leo, resourceId: "r-accessibility", lessonId: null, completed: true, progressPct: 100, updatedAt: ago(4) },
      { userId: people.maya, resourceId: "r-course", lessonId: "lesson-1", completed: true, progressPct: 25, updatedAt: ago(1) },
    ])
    .run();

  db.insert(learnerFeedback)
    .values([
      {
        userId: people.leo,
        resourceId: "r-course",
        rating: 5,
        body: "The calibration section changed how I read every dashboard at work. Worth it for lesson one alone.",
        createdAt: ago(3),
      },
      {
        userId: people.maya,
        resourceId: "r-accessibility",
        rating: 4,
        body: "Short and genuinely useful. The reduced-motion check caught something in our prototype.",
        createdAt: ago(2),
      },
    ])
    .run();

  /* -------------------------------- stories -------------------------------- */

  const provider = getStoryProvider();
  const sourceScenes = [
    {
      title: "River Watch: from a leaking box to a field guide",
      narration:
        "River Watch is a volunteer monitoring network building low-cost water-quality sensors for the lower Wye catchment. This story uses only approved project documentation.",
      visualDescription: "Title card with project category and stage",
      motion: "rise",
      durationSeconds: 5,
      sourceType: null,
      sourceId: null,
      contributors: [],
      factStatus: "documented" as const,
      aiGenerated: false,
    },
    {
      title: "The real problem was the cable entry",
      narration:
        "Two volunteers independently reported the same failure: water gets in at the cable entry and the connector corrodes. Reframing the task from 'make a box' to 'solve the gland' changed the design.",
      visualDescription: "Source card: work log entry by Jonas Berg",
      motion: "pan",
      durationSeconds: 8,
      sourceType: "work_log" as const,
      sourceId: null,
      contributors: [{ userId: people.jonas, name: "Jonas Berg" }],
      factStatus: "documented" as const,
      aiGenerated: false,
    },
    {
      title: "The first ingress test failed",
      narration:
        "Version one passed a splash test and failed a 72-hour soak at the gland. Switching to an M12 gland with a silicone washer fixed it. The failure photos stayed in the guide.",
      visualDescription: "Source card: experiment entry by Jonas Berg",
      motion: "zoom",
      durationSeconds: 8,
      sourceType: "work_log" as const,
      sourceId: null,
      contributors: [{ userId: people.jonas, name: "Jonas Berg" }],
      factStatus: "documented" as const,
      aiGenerated: false,
    },
    {
      title: "Repairability beat a 60p saving",
      narration:
        "A press-fit lid would have been cheaper and faster. It was rejected because a volunteer in a wet field needs to open the housing with a screwdriver.",
      visualDescription: "Source card: decision entry by Jonas Berg",
      motion: "fade",
      durationSeconds: 7,
      sourceType: "work_log" as const,
      sourceId: null,
      contributors: [{ userId: people.jonas, name: "Jonas Berg" }],
      factStatus: "documented" as const,
      aiGenerated: false,
    },
    {
      title: "What the trust asked for next",
      narration:
        "The dashboard alpha is open for a contributor. Acceptance criteria: loads in under two seconds on a mid-range phone, flags stale readings, keyboard navigable and meets WCAG AA contrast.",
      visualDescription: "Source card: project update by Maya Okafor",
      motion: "pan",
      durationSeconds: 8,
      sourceType: "update" as const,
      sourceId: "upd-river-2",
      contributors: [{ userId: people.maya, name: "Maya Okafor" }],
      factStatus: "documented" as const,
      aiGenerated: false,
    },
  ];

  db.insert(storyboards)
    .values([
      {
        id: "story-river",
        projectId: "p-river",
        createdBy: people.maya,
        title: "River Watch — the build story",
        summary: "How a failed water test became the most useful part of a volunteer sensor project.",
        status: "published",
        version: 2,
        provider: provider.id,
        visibility: "public",
        aiGenerated: true,
        transcript: sourceScenes.map((scene) => scene.narration).join("\n\n"),
        approvedBy: people.maya,
        approvedAt: ago(18),
        createdAt: ago(20),
        updatedAt: ago(17),
      },
      {
        id: "story-routes",
        projectId: "p-routes",
        createdBy: people.amara,
        title: "Quiet Routes — research findings",
        summary: "Draft story awaiting owner review. Nine of thirty routes disagreed with participants in v1.",
        status: "in_review",
        version: 1,
        provider: provider.id,
        visibility: "public",
        aiGenerated: true,
        createdAt: ago(2),
        updatedAt: ago(2),
      },
    ])
    .run();

  sourceScenes.forEach((scene, index) => {
    const row = {
      storyboardId: "story-river",
      orderIndex: index,
      title: scene.title,
      narration: scene.narration,
      visualDescription: scene.visualDescription,
      motion: scene.motion,
      durationSeconds: scene.durationSeconds,
      sourceType: scene.sourceType,
      sourceId: scene.sourceId,
      contributors: scene.contributors,
      factStatus: scene.factStatus,
      aiGenerated: scene.aiGenerated,
    };
    db.insert(storyScenes).values(row).run();
    db.insert(storyScenes)
      .values({ ...row, storyboardId: "story-routes", narration: index === 0 ? `${scene.narration} (draft)` : scene.narration })
      .run();
  });

  db.insert(mediaApprovals)
    .values([
      { storyboardId: "story-river", approverId: people.maya, decision: "approved", note: "Checked every scene against the source entries.", createdAt: ago(18) },
    ])
    .run();

  const svg = await provider.renderExplainer(
    { title: "River Watch — the build story", summary: "Approved project story" },
    sourceScenes.map((scene) => ({
      title: scene.title,
      narration: scene.narration,
      visualDescription: scene.visualDescription,
      motion: scene.motion,
      durationSeconds: scene.durationSeconds,
      sourceType: scene.sourceType,
      sourceId: scene.sourceId,
      contributors: scene.contributors,
      factStatus: scene.factStatus,
      aiGenerated: scene.aiGenerated,
    })),
  );
  const animation = await saveGeneratedMedia({
    buffer: svg,
    filename: "river-watch-story.svg",
    mimeType: "image/svg+xml",
    ownerId: people.maya,
    projectId: "p-river",
    visibility: "public",
  });
  db.insert(generatedMedia)
    .values([
      { storyboardId: "story-river", kind: "animation", provider: provider.id, status: "ready", fileId: animation.id, createdAt: ago(18) },
      { storyboardId: "story-river", kind: "narration", provider: provider.id, status: "ready", createdAt: ago(20) },
    ])
    .run();

  // Link the story resource to the published storyboard for real playback.
  db.update(learningResources).set({ storyboardId: "story-river" }).where(eqId("r-story")).run();

  db.insert(consentRecords)
    .values([
      { userId: people.jonas, scope: "public_story", projectId: "p-river", granted: true, note: "Consent recorded when documenting the housing task.", grantedAt: ago(45) },
      { userId: people.amara, scope: "public_story", projectId: "p-river", granted: true, grantedAt: ago(40) },
      { userId: people.maya, scope: "public_story", projectId: "p-river", granted: true, grantedAt: ago(45) },
      { userId: people.maya, scope: "voice", projectId: "p-river", granted: false, note: "No synthetic voice consent on file." },
    ])
    .run();

  /* ---------------------------------- chat --------------------------------- */

  db.insert(conversations)
    .values([
      { id: "conv-river", projectId: "p-river", kind: "group", title: "River Watch team", createdBy: people.maya, createdAt: ago(50) },
      { id: "conv-dm", kind: "direct", createdBy: people.leo, createdAt: ago(4) },
    ])
    .run();
  db.insert(conversationMembers)
    .values([
      { conversationId: "conv-river", userId: people.maya, role: "admin", lastReadAt: ago(0) },
      { conversationId: "conv-river", userId: people.jonas, role: "member", lastReadAt: ago(1) },
      { conversationId: "conv-river", userId: people.amara, role: "member", lastReadAt: ago(2) },
      { conversationId: "conv-dm", userId: people.leo, role: "member", lastReadAt: ago(0) },
      { conversationId: "conv-dm", userId: people.maya, role: "member", lastReadAt: ago(1) },
    ])
    .run();
  db.insert(messages)
    .values([
      { conversationId: "conv-river", senderId: people.maya, body: "Housing is accepted — thank you Jonas. Am I right that the gland swap is in the guide?", createdAt: ago(21) },
      { conversationId: "conv-river", senderId: people.jonas, body: "Yes, with photos of the failed version. The BOM now lists the correct gland.", createdAt: ago(21) },
      { conversationId: "conv-river", senderId: people.amara, body: "Calibration is going slower than planned: site 3 access has changed. I have paused rather than trespass.", createdAt: ago(5) },
      { conversationId: "conv-river", senderId: people.maya, body: "Good call. I will speak to the trust this week. Three sites is still enough to publish a limitation.", createdAt: ago(5) },
      { conversationId: "conv-dm", senderId: people.leo, body: "Hi Maya — I applied for the dashboard task. Happy to answer anything about my portfolio.", createdAt: ago(4) },
      { conversationId: "conv-dm", senderId: people.maya, body: "Thanks Leo — I saw it. The accessibility bar is the part I care most about. Could you walk me through how you tested focus states before?", createdAt: ago(3) },
    ])
    .run();

  /* ------------------------------ notifications ---------------------------- */

  db.insert(notifications)
    .values([
      { userId: people.maya, kind: "interest_received", title: "New interest in River Watch", body: "Leo Chen offered to help with the dashboard task.", href: "/projects/p-river?tab=team", actorId: people.leo, createdAt: ago(4) },
      { userId: people.maya, kind: "message", title: "New direct message", body: "Thanks Leo — I saw it…", href: "/chats/conv-dm", actorId: people.leo, createdAt: ago(3) },
      { userId: people.maya, kind: "invitation", title: "Invitation to join Mend Studio", body: "Priya Nair invited you as an admin.", href: "/notifications", actorId: people.priya, createdAt: ago(3) },
      { userId: people.jonas, kind: "contribution_confirmed", title: "Work accepted: Prototype a repairable sensor housing", body: "Recorded as owner-confirmed in your contribution history.", href: "/settings?tab=contributions", actorId: people.maya, createdAt: ago(21) },
      { userId: people.amara, kind: "story_approval", title: "A project story needs your approval", body: "Quiet Routes research findings", href: "/projects/p-routes/story", actorId: people.amara, createdAt: ago(2) },
      { userId: people.leo, kind: "learning_sale", title: "You now have access to Field data for community projects", body: "Access was granted directly. No payment was processed.", href: "/learn/r-course", actorId: people.amara, createdAt: ago(10) },
    ])
    .run();

  /* ------------------------------- moderation ------------------------------ */

  db.insert(reports)
    .values([
      {
        id: "rep-1",
        reporterId: people.ruth,
        targetType: "post",
        targetId: "post-7",
        reasonCode: "misleading_claims",
        details:
          "This claims two sensors are 'consistently wrong' without naming them or the method. Reporting for review of the claim, not the person.",
        status: "open",
        createdAt: ago(2),
      },
      {
        id: "rep-2",
        reporterId: people.leo,
        targetType: "user",
        targetId: people.jonas,
        reasonCode: "impersonation",
        details: "Profile claims 'official River Trust engineer'. The trust has not confirmed this. (Demonstration report.)",
        status: "triaging",
        assignedTo: people.ruth,
        createdAt: ago(1),
      },
    ])
    .run();

  db.insert(disputes)
    .values({
      id: "disp-1",
      raisedBy: people.amara,
      attributionId: "attr-amara-pantry",
      projectId: "p-pantry",
      taskId: "t-pantry-onboarding",
      subject: "Role description understates the work",
      details:
        "The record says 'service design' but I also ran the two kitchen tests and rewrote the escalation section. Requesting a corrected summary.",
      status: "open",
      createdAt: ago(2),
    })
    .run();

  db.insert(challenges)
    .values([
      {
        hostId: people.maya,
        title: "Document one failure this month",
        slug: "document-one-failure",
        description:
          "Publish a work-log entry about something that did not work, with what you changed. The most useful documentation is usually the failure.",
        category: "community",
        status: "active",
        deadline: ago(-20),
        createdAt: ago(10),
      },
      {
        hostId: people.priya,
        title: "Repair guide sprint",
        slug: "repair-guide-sprint",
        description: "Turn one repair you have done into a guide someone else could follow in 30 minutes.",
        category: "sustainability",
        status: "upcoming",
        deadline: ago(-40),
        createdAt: ago(6),
      },
    ])
    .run();

  /* ------------------------------- reputation ------------------------------ */

  db.insert(reputationEvents)
    .values([
      { userId: people.jonas, dimension: "contribution", points: 12, reason: "Task completed: Prototype a repairable sensor housing", sourceType: "task", sourceId: "t-housing", createdAt: ago(21) },
      { userId: people.jonas, dimension: "contribution", points: 4, reason: "Milestone completed: Working sensor prototype", sourceType: "milestone", sourceId: "ms-1", createdAt: ago(21) },
      { userId: people.jonas, dimension: "expertise", points: 6, reason: "Demonstrated delivery on repairable housing", sourceType: "submission", sourceId: "sub-housing", skillId: "s-arduino", createdAt: ago(21) },
      { userId: people.jonas, dimension: "teaching", points: 8, reason: "Learning resource published: Building a £10 sensor housing", sourceType: "resource", sourceId: "r-fieldguide", createdAt: ago(18) },
      { userId: people.jonas, dimension: "teaching", points: 6, reason: "Learning journey published", sourceType: "journey", sourceId: "j-river", createdAt: ago(19) },
      { userId: people.jonas, dimension: "influence", points: 1, reason: "New follower", sourceType: "follow", sourceId: "f-leo-jonas", createdAt: ago(20) },
      { userId: people.amara, dimension: "contribution", points: 12, reason: "Task completed: Kitchen onboarding checklist", sourceType: "task", sourceId: "t-pantry-onboarding", createdAt: ago(55) },
      { userId: people.amara, dimension: "teaching", points: 8, reason: "Course published: Field data for community projects", sourceType: "resource", sourceId: "r-course", createdAt: ago(14) },
      { userId: people.amara, dimension: "teaching", points: 3, reason: "Positive learner feedback", sourceType: "feedback", sourceId: "fb-leo-course", createdAt: ago(3) },
      { userId: people.maya, dimension: "contribution", points: 4, reason: "Milestone completed: Dashboard alpha with the trust", sourceType: "milestone", sourceId: "ms-2", createdAt: ago(6) },
      { userId: people.maya, dimension: "influence", points: 3, reason: "Project story published", sourceType: "storyboard", sourceId: "story-river", createdAt: ago(17) },
      { userId: people.leo, dimension: "expertise", points: 2, reason: "Public work log published", sourceType: "work_log", sourceId: "wl-leo", createdAt: ago(9) },
    ])
    .run();

  db.insert(achievements)
    .values([
      { userId: people.jonas, kind: "first_delivery", title: "First accepted delivery", description: "Completed a task that a project owner accepted.", earnedAt: ago(21) },
      { userId: people.jonas, kind: "documented_failure", title: "Documented a failure", description: "Published documentation of something that did not work.", earnedAt: ago(41) },
      { userId: people.amara, kind: "first_course", title: "Published a course", description: "Published structured learning material.", earnedAt: ago(14) },
      { userId: people.maya, kind: "story_published", title: "Storyteller", description: "Published an approved animated project story.", earnedAt: ago(17) },
    ])
    .run();

  db.insert(analyticsEvents)
    .values(
      Array.from({ length: 40 }).flatMap((_, index) =>
        ["p-river", "p-routes", "p-pantry"].map((projectId) => ({
          kind: "project_view",
          targetType: "project",
          targetId: projectId,
          userId: null,
          createdAt: ago(20 - Math.floor(index / 2)),
        })),
      ),
    )
    .run();

  db.insert(authTokens).values([{ id: "unused-seed-token", userId: people.leo, kind: "verify_email", expiresAt: ago(60) }]).run();

  const counts = {
    users: 7,
    projects: 5,
    tasks: 6,
    resources: 4,
    stories: 2,
  };

  console.log("");
  console.log("Seed complete.");
  console.log(`  ${counts.users} people · ${counts.projects} projects · ${counts.tasks} tasks · ${counts.resources} learning resources · ${counts.stories} stories`);
  console.log("");
  console.log("  Sign in with any seeded email account, e.g.:");
  console.log("    maya@example.test   (creator, @maya_okafor)");
  console.log("    jonas@example.test  (contributor, @jonas_b)");
  console.log("    sam@example.test    (administrator, @sam_admin)");
  console.log(`  Password for every demo account: ${PASSWORD}`);
  console.log("");
  console.log("  All people, projects and results are fictional demonstration data.");
}

// Small local helper so the seed can update by id without importing drizzle operators.
import { eq } from "drizzle-orm";
function eqId(id: string) {
  return eq(learningResources.id, id);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("db/seed.ts")) {
  seedDemoData().catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
}
