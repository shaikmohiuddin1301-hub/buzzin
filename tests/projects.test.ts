import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projectMembers } from "@/db/schema";
import {
  createProject,
  deleteProject,
  inviteToProject,
  pendingInvitations,
  projectAnalytics,
  projectDetail,
  removeMember,
  respondToInvitation,
  toggleProjectFollow,
  updateProject,
} from "@/services/projects";
import { expressInterest, projectInterests, respondToInterest } from "@/services/tasks";
import { addMember, makeProject, makeUser, projectInput, projectRow } from "./helpers";

function memberRow(projectId: string, userId: string) {
  return getDb()
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
}

describe("project creation", () => {
  it("creates a published project with the owner on the team and milestones attached", async () => {
    const owner = await makeUser();
    const { id, slug } = createProject(
      owner.id,
      projectInput({
        name: "Riverside Repair Cafe",
        milestones: [{ title: "Fix ten devices" }, { title: "Publish repair guide" }],
        skills: ["Repair", "Teaching"],
      }),
    );

    const detail = projectDetail(id, owner)!;
    expect(detail.project.status).toBe("published");
    expect(detail.project.ownerId).toBe(owner.id);
    expect(slug).toBe("riverside-repair-cafe");
    expect(detail.members.map((member) => member.userId)).toContain(owner.id);
    expect(detail.milestones).toHaveLength(2);
    expect(detail.skills.map((skill) => skill.name)).toEqual(expect.arrayContaining(["Repair", "Teaching"]));
  });

  it("accepts drafts without publishing them", async () => {
    const owner = await makeUser();
    const { id } = createProject(owner.id, projectInput({ publish: false, name: "Draft only" }));

    expect(projectRow(id).status).toBe("draft");
    expect(projectDetail(id, null)).toBeNull();
  });

  it("requires an unpaid listing to state what contributors receive", async () => {
    const owner = await makeUser();
    expect(() =>
      createProject(owner.id, projectInput({ compensationType: "unpaid", compensationDetails: "" })),
    ).toThrow(/describe what contributors receive/i);
  });

  it("rejects a description that is too short to be useful", async () => {
    const owner = await makeUser();
    expect(() => createProject(owner.id, projectInput({ shortDescription: "Too short" }))).toThrow(/20 characters/i);
  });

  it("gives duplicate project names distinct slugs", async () => {
    const owner = await makeUser();
    const first = makeProject(owner.id, { name: "Same name" });
    const second = makeProject(owner.id, { name: "Same name" });
    expect(first.slug).not.toBe(second.slug);
  });
});

describe("project visibility and authorisation", () => {
  it("hides a private project from outsiders and blocks their edits", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id } = makeProject(owner.id, { visibility: "private" });

    expect(projectDetail(id, null)).toBeNull();
    expect(projectDetail(id, outsider)).toBeNull();
    expect(() => updateProject(id, { id: outsider.id }, { name: "Hijacked" })).toThrow();
    expect(projectRow(id).name).not.toBe("Hijacked");
  });

  it("lets accepted members see a private project", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const { id } = makeProject(owner.id, { visibility: "private" });
    addMember(id, member.id);

    expect(projectDetail(id, member)).not.toBeNull();
    expect(() => updateProject(id, { id: member.id }, { name: "Member edit" })).toThrow();
  });

  it("only the owner can delete a project, and only by typing its name", async () => {
    const owner = await makeUser();
    const { id } = makeProject(owner.id, { name: "Deletable project" });

    expect(() => deleteProject(id, { id: owner.id }, "wrong")).toThrow();
    deleteProject(id, { id: owner.id }, "Deletable project");
    expect(projectRow(id)).toBeUndefined();
  });
});

describe("expressions of interest", () => {
  it("records interest, blocks duplicates and lets the owner accept the contributor", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id } = makeProject(owner.id);

    const eoiId = expressInterest(contributor.id, {
      projectId: id,
      intent: "join_team",
      message: "I can help with the research and the write-up.",
    });

    expect(() =>
      expressInterest(contributor.id, { projectId: id, intent: "join_team" }),
    ).toThrow(/already expressed interest/i);

    const queue = projectInterests(id, owner);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.userName).toBeTruthy();

    // Another contributor cannot act on someone else's request.
    const stranger = await makeUser();
    expect(() => respondToInterest(eoiId, { id: stranger.id }, "accepted")).toThrow();

    respondToInterest(eoiId, owner, "accepted", "Welcome aboard.");
    expect(memberRow(id, contributor.id)?.status).toBe("active");
    expect(projectDetail(id, contributor)).not.toBeNull();
  });

  it("refuses interest from the project owner", async () => {
    const owner = await makeUser();
    const { id } = makeProject(owner.id);
    expect(() => expressInterest(owner.id, { projectId: id, intent: "contribute" })).toThrow(/own this project/i);
  });
});

describe("invitations and removal", () => {
  it("adds the invitee on acceptance and only to their own invitation", async () => {
    const owner = await makeUser();
    const invitee = await makeUser();
    const other = await makeUser();
    const { id } = makeProject(owner.id);

    inviteToProject(id, owner, { userId: invitee.id, role: "reviewer", message: "Please review submissions." });
    const invitations = pendingInvitations(invitee.id);
    expect(invitations).toHaveLength(1);
    const invitationId = invitations[0]!.id;

    expect(() => respondToInvitation(invitationId, other.id, true)).toThrow();
    respondToInvitation(invitationId, invitee.id, true);

    const membership = memberRow(id, invitee.id);
    expect(membership?.status).toBe("active");
    expect(membership?.role).toBe("reviewer");
    expect(pendingInvitations(invitee.id)).toHaveLength(0);
  });

  it("revokes access when a member is removed", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const { id } = makeProject(owner.id, { visibility: "private" });
    addMember(id, member.id);

    removeMember(id, owner, member.id);
    expect(memberRow(id, member.id)?.status).toBe("removed");
    expect(projectDetail(id, member)).toBeNull();
  });

  it("refuses to remove the owner", async () => {
    const owner = await makeUser();
    const { id } = makeProject(owner.id);
    expect(() => removeMember(id, owner, owner.id)).toThrow(/owner/i);
  });
});

describe("following", () => {
  it("toggles a follow on and off and updates the counter", async () => {
    const owner = await makeUser();
    const fan = await makeUser();
    const { id } = makeProject(owner.id);

    expect(toggleProjectFollow(id, fan.id)).toBe(true);
    expect(projectDetail(id, fan)!.counts.followers).toBe(1);
    expect(projectDetail(id, fan)!.isFollowing).toBe(true);

    expect(toggleProjectFollow(id, fan.id)).toBe(false);
    expect(projectDetail(id, fan)!.counts.followers).toBe(0);
  });
});

describe("project analytics", () => {
  it("is limited to the owner", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const { id } = makeProject(owner.id);
    addMember(id, member.id);

    expect(() => projectAnalytics(id, { id: member.id })).toThrow();
    const analytics = projectAnalytics(id, { id: owner.id });
    expect(analytics.views).toBe(0);
    expect(analytics.follows).toBe(0);
    expect(Array.isArray(analytics.viewsByDay)).toBe(true);
  });
});
