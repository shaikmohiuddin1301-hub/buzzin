import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { taskSubmissions } from "@/db/schema";
import { audit } from "@/lib/notify";
import { confirmScope, expressInterest, respondToInterest, reviewSubmission, submitWork } from "@/services/tasks";
import { makeProject, makeTask, makeUser } from "./helpers";

/**
 * Database-level guarantees.
 *
 * These are checks the service layer cannot make for itself: a trigger, a partial index and
 * the migration ledger. They are asserted directly against SQLite because the point is that
 * they hold even when application code is bypassed.
 */

function auditRowCount(): number {
  return (getSqlite().prepare("SELECT count(*) AS n FROM audit_logs").get() as { n: number }).n;
}

describe("audit history is append-only", () => {
  it("rejects an update through raw SQL, not just through the service layer", () => {
    audit({ action: "test.append_only", targetType: "project", targetId: "p-1" });
    expect(auditRowCount()).toBeGreaterThan(0);

    expect(() => getSqlite().exec("UPDATE audit_logs SET action = 'tampered'")).toThrow(/append-only/i);
  });

  it("rejects a delete through raw SQL", () => {
    audit({ action: "test.append_only_delete" });

    expect(() => getSqlite().exec("DELETE FROM audit_logs")).toThrow(/append-only/i);
    expect(auditRowCount()).toBeGreaterThan(0);
  });

  it("still accepts new rows", () => {
    const before = auditRowCount();
    audit({ action: "test.insert_after_guard" });
    expect(auditRowCount()).toBe(before + 1);
  });
});

describe("one pending submission per contributor per task", () => {
  async function assignedTask() {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id, { allowPublicDocs: true });
    const taskId = makeTask(projectId, owner.id);

    const eoiId = expressInterest(contributor.id, {
      projectId,
      taskId,
      intent: "help_task",
      message: "I have done similar work before.",
    });
    respondToInterest(eoiId, owner, "accepted");
    confirmScope(taskId, contributor.id);
    return { owner, contributor, taskId };
  }

  it("refuses a second submission while the first is awaiting review", async () => {
    const { contributor, taskId } = await assignedTask();

    submitWork(taskId, contributor.id, { note: "First pass", files: [] });

    expect(() => submitWork(taskId, contributor.id, { note: "Second pass", files: [] })).toThrow();
    expect(getDb().select().from(taskSubmissions).where(eq(taskSubmissions.taskId, taskId)).all()).toHaveLength(1);
  });

  it("enforces the same rule in the database when the service check is bypassed", async () => {
    const { contributor, taskId } = await assignedTask();
    submitWork(taskId, contributor.id, { note: "First pass", files: [] });

    // A retried or double-posted request that skipped the service check would hit this index.
    expect(() =>
      getDb()
        .insert(taskSubmissions)
        .values({
          id: `dup-${Date.now()}`,
          taskId,
          userId: contributor.id,
          note: "Racing duplicate",
          status: "submitted",
        })
        .run(),
    ).toThrow(/UNIQUE|constraint/i);
  });

  it("allows a resubmission once the previous one has been reviewed", async () => {
    const { owner, contributor, taskId } = await assignedTask();
    const submissionId = submitWork(taskId, contributor.id, { note: "First pass", files: [] });

    reviewSubmission(submissionId, owner, "revision_requested", "Please add the missing summary.");

    expect(() => submitWork(taskId, contributor.id, { note: "Addressed feedback", files: [] })).not.toThrow();
    expect(getDb().select().from(taskSubmissions).where(eq(taskSubmissions.taskId, taskId)).all()).toHaveLength(2);
  });
});

describe("migrations", () => {
  it("is idempotent: a second run applies nothing", () => {
    expect(runMigrations()).toEqual([]);
  });

  it("records every applied migration in the ledger", () => {
    const names = (getSqlite().prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(names).toContain("0000_init.sql");
    expect(names).toContain("1000_audit_append_only.sql");
    expect(names).toContain("1001_submission_pending_unique.sql");
  });

  it("installs both audit guards", () => {
    const triggers = (getSqlite().prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as {
      name: string;
    }[]).map((row) => row.name);
    expect(triggers).toContain("audit_logs_block_update");
    expect(triggers).toContain("audit_logs_block_delete");
  });
});
