/**
 * Fixtures for the integration tests.
 *
 * Everything goes through the real service layer, so the tests exercise the same
 * validation and authorisation paths the app uses.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projectMembers, projects, users } from "@/db/schema";
import { registerUser } from "@/services/users";
import { createProject, type CreateProjectInput } from "@/services/projects";
import { createTask, type CreateTaskInput } from "@/services/tasks";

let counter = 0;

export function uniqueLabel(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}${Date.now().toString(36).slice(-4)}`;
}

export type TestUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  isAdmin: boolean;
};

export async function makeUser(
  overrides: { roles?: ("creator" | "contributor" | "learner" | "educator" | "business")[]; admin?: boolean } = {},
): Promise<TestUser> {
  const label = uniqueLabel("user");
  const email = `${label}@example.test`;
  const password = "correct-horse-battery";
  const result = await registerUser({
    email,
    password,
    displayName: `Test ${label}`,
    username: label.toLowerCase().slice(0, 20),
    roles: overrides.roles ?? ["creator", "contributor", "learner"],
    // Distinct IPs keep the registration limiter from blocking the fixtures.
    ip: `10.0.0.${counter % 250}`,
  });

  // Email verification is required for publishing operations in the app, so the
  // fixtures are verified — except when a test explicitly wants an unverified user.
  getDb()
    .update(users)
    .set({ emailVerifiedAt: new Date().toISOString(), ...(overrides.admin ? { isAdmin: true, isModerator: true } : {}) })
    .where(eq(users.id, result.userId))
    .run();

  return { id: result.userId, username: result.username, email, password, isAdmin: !!overrides.admin };
}

export function projectInput(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
  return {
    name: `Test project ${uniqueLabel("p")}`,
    shortDescription: "A project created by the automated test suite to exercise real workflows.",
    overview: "We are testing the platform end to end with fixtures that behave like real records.",
    problem: "Tests need real data.",
    audience: "Developers",
    category: "software",
    stage: "building",
    visibility: "public",
    workMode: "remote",
    effort: "2 weeks",
    compensationType: "unpaid",
    compensationDetails: "Portfolio credit and a reference",
    allowPublicDocs: true,
    confidentialityNotes: "Nothing confidential in test fixtures.",
    ipNotes: "Contributors keep copyright of their own work.",
    links: [],
    skills: ["TypeScript"],
    milestones: [{ title: "First milestone" }],
    publish: true,
    ...overrides,
  };
}

export function makeProject(ownerId: string, overrides: Partial<CreateProjectInput> = {}) {
  return createProject(ownerId, projectInput(overrides));
}

export function taskInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    title: `Test task ${uniqueLabel("t")}`,
    description: "Do the thing, document the process, submit the result.",
    objective: "Prove the workflow works.",
    deliverablesSpec: "A short written summary and one link.",
    acceptanceCriteria: "The owner can read the summary and confirm it addresses the objective.",
    effort: "4 hours",
    compensationType: "unpaid",
    compensationDetails: "Portfolio credit",
    visibility: "public",
    skills: ["TypeScript"],
    publish: true,
    ...overrides,
  };
}

export function makeTask(projectId: string, ownerId: string, overrides: Partial<CreateTaskInput> = {}) {
  return createTask(projectId, { id: ownerId }, taskInput(overrides));
}

/** Adds a user to a project team directly, bypassing the interest flow. */
export function addMember(projectId: string, userId: string, role: "collaborator" | "reviewer" = "collaborator") {
  getDb()
    .insert(projectMembers)
    .values({ id: randomUUID(), projectId, userId, role, status: "active" })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { status: "active", role } })
    .run();
}

export function projectRow(projectId: string) {
  return getDb().select().from(projects).where(eq(projects.id, projectId)).get()!;
}
