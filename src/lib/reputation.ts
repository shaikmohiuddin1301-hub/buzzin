import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { achievements, learnerFeedback, learningResources, reputationEvents, skills } from "@/db/schema";
import type { ReputationDimension } from "@/lib/types";

/**
 * Reputation is deliberately split into four dimensions. None of them is
 * presented as a measure of a person's worth, and every point is traceable to
 * a row in `reputation_events` that names its source record.
 */

export const REPUTATION_WEIGHTS = {
  contribution: {
    task_completed: 12,
    attribution_confirmed: 8,
    milestone_completed: 4,
  },
  expertise: {
    skill_evidence: 6,
    work_log_public: 2,
  },
  teaching: {
    resource_published: 8,
    learner_feedback_positive: 3,
    journey_published: 6,
  },
  influence: {
    follower_gained: 1,
    story_published: 5,
  },
} as const;

export function awardReputation(input: {
  userId: string;
  dimension: ReputationDimension;
  points: number;
  reason: string;
  sourceType: string;
  sourceId: string;
  skillId?: string | null;
}): void {
  const db = getDb();
  // Idempotent: the same source event cannot award points twice.
  const existing = db
    .select({ id: reputationEvents.id })
    .from(reputationEvents)
    .where(
      and(
        eq(reputationEvents.userId, input.userId),
        eq(reputationEvents.sourceType, input.sourceType),
        eq(reputationEvents.sourceId, input.sourceId),
        eq(reputationEvents.dimension, input.dimension),
      ),
    )
    .get();
  if (existing) return;

  db.insert(reputationEvents)
    .values({
      userId: input.userId,
      dimension: input.dimension,
      points: input.points,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      skillId: input.skillId ?? null,
    })
    .run();
}

export type ReputationSummary = {
  totals: Record<ReputationDimension, number>;
  skills: { skillId: string; name: string; points: number; events: number }[];
  recent: { reason: string; points: number; dimension: string; createdAt: string }[];
  feedback: { average: number; count: number };
};

export function reputationSummary(userId: string): ReputationSummary {
  const db = getDb();
  const totals: Record<ReputationDimension, number> = {
    contribution: 0,
    expertise: 0,
    teaching: 0,
    influence: 0,
  };

  const grouped = db
    .select({
      dimension: reputationEvents.dimension,
      total: sql<number>`coalesce(sum(${reputationEvents.points}), 0)`,
    })
    .from(reputationEvents)
    .where(eq(reputationEvents.userId, userId))
    .groupBy(reputationEvents.dimension)
    .all();
  for (const row of grouped) totals[row.dimension] = Number(row.total);

  const skillRows = db
    .select({
      skillId: reputationEvents.skillId,
      name: skills.name,
      points: sql<number>`coalesce(sum(${reputationEvents.points}), 0)`,
      events: sql<number>`count(*)`,
    })
    .from(reputationEvents)
    .innerJoin(skills, eq(skills.id, reputationEvents.skillId))
    .where(eq(reputationEvents.userId, userId))
    .groupBy(reputationEvents.skillId, skills.name)
    .orderBy(sql`sum(${reputationEvents.points}) desc`)
    .limit(8)
    .all();

  const recent = db
    .select({
      reason: reputationEvents.reason,
      points: reputationEvents.points,
      dimension: reputationEvents.dimension,
      createdAt: reputationEvents.createdAt,
    })
    .from(reputationEvents)
    .where(eq(reputationEvents.userId, userId))
    .orderBy(sql`${reputationEvents.createdAt} desc`)
    .limit(8)
    .all();

  // Learner feedback is a teaching-quality signal, so it is scoped to the
  // resources this person actually created — never platform-wide.
  const feedback = db
    .select({ average: sql<number>`avg(${learnerFeedback.rating})`, count: sql<number>`count(*)` })
    .from(learnerFeedback)
    .innerJoin(learningResources, eq(learningResources.id, learnerFeedback.resourceId))
    .where(and(eq(learnerFeedback.status, "visible"), eq(learningResources.creatorId, userId)))
    .get();

  return {
    totals,
    skills: skillRows.map((row) => ({
      skillId: row.skillId ?? "",
      name: row.name,
      points: Number(row.points),
      events: Number(row.events),
    })),
    recent,
    feedback: {
      average: feedback?.average ? Number(feedback.average) : 0,
      count: Number(feedback?.count ?? 0),
    },
  };
}

export function grantAchievement(userId: string, kind: string, title: string, description?: string): void {
  const db = getDb();
  const existing = db
    .select({ id: achievements.id })
    .from(achievements)
    .where(and(eq(achievements.userId, userId), eq(achievements.kind, kind)))
    .get();
  if (existing) return;
  db.insert(achievements).values({ userId, kind, title, description: description ?? null }).run();
}

export function achievementsFor(userId: string) {
  return getDb()
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(sql`${achievements.earnedAt} desc`)
    .all();
}
