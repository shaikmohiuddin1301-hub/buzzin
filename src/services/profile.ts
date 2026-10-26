/**
 * Read models for the public profile.
 *
 * Everything here is derived from records that already exist elsewhere — the
 * profile never stores a denormalised "score" of its own, so a disputed or
 * corrected attribution is reflected immediately.
 */

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  contributorAttributions,
  projectMembers,
  projects,
  skills,
  taskAssignments,
  taskSkills,
  users,
} from "@/db/schema";

/**
 * Card-shaped rows: the owner and the counters a project card needs.
 *
 * `publicOnly` is used when somebody else is looking at a profile: drafts, archived
 * projects and private projects are the owner's business until they are published
 * publicly, so they must not appear in a visitor's view of a profile.
 */
function cardRows(ids: string[], publicOnly: boolean) {
  if (ids.length === 0) return [];
  return getDb()
    .select({
      project: projects,
      owner: { username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId },
      followers: sql<number>`(select count(*) from project_follows pf where pf.project_id = ${projects.id})`,
      openTasks: sql<number>`(select count(*) from tasks t where t.project_id = ${projects.id} and t.status = 'open')`,
      members: sql<number>`(select count(*) from project_members pm where pm.project_id = ${projects.id} and pm.status = 'active')`,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(
      publicOnly
        ? and(inArray(projects.id, ids), eq(projects.status, "published"), ne(projects.visibility, "private"))
        : inArray(projects.id, ids),
    )
    .orderBy(desc(projects.updatedAt))
    .all()
    .map((row) => ({
      ...row.project,
      owner: row.owner,
      followerCount: Number(row.followers),
      openTaskCount: Number(row.openTasks),
      memberCount: Number(row.members),
    }));
}

export function projectHistory(userId: string, options: { publicOnly?: boolean } = {}) {
  const publicOnly = !!options.publicOnly;
  const db = getDb();
  const ownedIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .all()
    .map((row) => row.id);
  const contributedIds = db
    .select({ id: projects.id })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "active"), ne(projects.ownerId, userId)))
    .all()
    .map((row) => row.id);
  return { owned: cardRows(ownedIds, publicOnly), contributed: cardRows(contributedIds, publicOnly) };
}

export function contributionCounts(userId: string) {
  const db = getDb();
  const attribution = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${contributorAttributions.status} in ('confirmed','verified','corrected') then 1 else 0 end)`,
      disputed: sql<number>`sum(case when ${contributorAttributions.status} = 'disputed' then 1 else 0 end)`,
    })
    .from(contributorAttributions)
    .where(eq(contributorAttributions.userId, userId))
    .get();

  const active = db
    .select({ count: sql<number>`count(*)` })
    .from(taskAssignments)
    .where(and(eq(taskAssignments.userId, userId), eq(taskAssignments.status, "active")))
    .get();

  return {
    total: Number(attribution?.total ?? 0),
    completed: Number(attribution?.completed ?? 0),
    disputed: Number(attribution?.disputed ?? 0),
    active: Number(active?.count ?? 0),
  };
}

/** Attribution rows that have actually been confirmed — shown separately from proposed ones. */
export function verifiedContributions(userId: string, options: { publicOnly?: boolean } = {}) {
  const conditions = [
    eq(contributorAttributions.userId, userId),
    sql`${contributorAttributions.status} in ('confirmed','verified','corrected')`,
  ];
  if (options.publicOnly) {
    conditions.push(eq(projects.status, "published"), ne(projects.visibility, "private"));
  }
  return getDb()
    .select({ attribution: contributorAttributions, projectName: projects.name })
    .from(contributorAttributions)
    .innerJoin(projects, eq(projects.id, contributorAttributions.projectId))
    .where(and(...conditions))
    .orderBy(desc(contributorAttributions.confirmedAt), desc(contributorAttributions.createdAt))
    .all();
}

/**
 * Skills a person has demonstrably worked with: the skills attached to tasks on
 * which they hold a confirmed contribution. Not self-declared skill tags.
 */
export function attributedSkills(userId: string) {
  const rows = getDb()
    .select({
      skillId: skills.id,
      name: skills.name,
      tasks: sql<number>`count(distinct ${contributorAttributions.taskId})`,
    })
    .from(contributorAttributions)
    .innerJoin(taskSkills, eq(taskSkills.taskId, contributorAttributions.taskId))
    .innerJoin(skills, eq(skills.id, taskSkills.skillId))
    .where(
      and(
        eq(contributorAttributions.userId, userId),
        sql`${contributorAttributions.status} in ('confirmed','verified','corrected')`,
      ),
    )
    .groupBy(skills.id, skills.name)
    .orderBy(sql`count(distinct ${contributorAttributions.taskId}) desc`)
    .limit(12)
    .all();

  return rows.map((row) => ({ ...row, tasks: Number(row.tasks) }));
}
