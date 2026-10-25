import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { socialShares } from "@/db/schema";
import { postProjectUpdate } from "@/services/projects";
import { deleteProjectShare, listProjectShares, shareProjectUpdate } from "@/services/socialShares";
import { makeProject, makeUser } from "./helpers";

const fetchMock = vi.fn();

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function rows() {
  return getDb().select().from(socialShares).all();
}

beforeEach(() => {
  // The suite shares one database per file, so each test starts from a clean share history.
  getDb().delete(socialShares).run();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.AYRSHARE_API_KEY = "test-key";
  process.env.AYRSHARE_BASE_URL = "https://social.test/api";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AYRSHARE_API_KEY;
  delete process.env.AYRSHARE_BASE_URL;
});

async function projectWithUpdate(visibility: "public" | "private" = "public") {
  const owner = await makeUser();
  const { id: projectId } = makeProject(owner.id);
  const updateId = postProjectUpdate(projectId, owner, {
    title: "First field test complete",
    body: "Twelve devices repaired and a written guide published for the next group.",
    visibility,
  });
  return { owner, projectId, updateId };
}

describe("sharing a project update", () => {
  it("fails closed when no Ayrshare key is configured", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();
    delete process.env.AYRSHARE_API_KEY;

    await expect(
      shareProjectUpdate(projectId, updateId, owner, { platforms: ["twitter"] }),
    ).rejects.toThrow(/not configured/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("posts to the selected networks and records what was published", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok", id: "ayr-post-1" }));

    const share = await shareProjectUpdate(projectId, updateId, owner, {
      platforms: ["twitter", "linkedin", "twitter"],
    });

    expect(share.status).toBe("posted");

    const [call] = fetchMock.mock.calls;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("https://social.test/api/post");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const payload = JSON.parse(String(init.body)) as { post: string; platforms: string[] };
    expect(payload.platforms).toEqual(["twitter", "linkedin"]);
    expect(payload.post).toContain("First field test complete");
    expect(payload.post).toContain(`/projects/${projectId}`);

    const [record] = rows();
    expect(record?.status).toBe("posted");
    expect(record?.remoteId).toBe("ayr-post-1");
    expect(record?.platforms).toEqual(["twitter", "linkedin"]);
  });

  it("accepts an owner-written message and still appends the project link", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok", id: "ayr-post-2" }));

    await shareProjectUpdate(projectId, updateId, owner, {
      platforms: ["telegram"],
      message: "Field test done: twelve repairs, one field guide.",
    });

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { post: string };
    expect(payload.post).toContain("Field test done");
    expect(payload.post).toContain(`/projects/${projectId}`);
  });

  it("refuses a team-only update", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate("private");

    await expect(
      shareProjectUpdate(projectId, updateId, owner, { platforms: ["twitter"] }),
    ).rejects.toThrow(/team-only/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses someone who cannot edit the project", async () => {
    const { projectId, updateId } = await projectWithUpdate();
    const stranger = await makeUser();

    await expect(
      shareProjectUpdate(projectId, updateId, stranger, { platforms: ["twitter"] }),
    ).rejects.toThrow();
    expect(rows()).toHaveLength(0);
  });

  it("rejects an unknown network and an empty selection", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();

    await expect(shareProjectUpdate(projectId, updateId, owner, { platforms: ["myspace"] })).rejects.toThrow(
      /at least one social network/i,
    );
    await expect(shareProjectUpdate(projectId, updateId, owner, { platforms: [] })).rejects.toThrow(
      /at least one social network/i,
    );
  });

  it("records a failed attempt with the provider's reason", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", message: "quota exceeded" }, 429));

    await expect(
      shareProjectUpdate(projectId, updateId, owner, { platforms: ["twitter"] }),
    ).rejects.toThrow(/quota exceeded/i);

    const [record] = rows();
    expect(record?.status).toBe("failed");
    expect(record?.error).toContain("quota exceeded");
    expect(record?.remoteId).toBeNull();
  });

  it("deletes a published post upstream and marks the record", async () => {
    const { owner, projectId, updateId } = await projectWithUpdate();
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok", id: "ayr-post-3" }));
    const share = await shareProjectUpdate(projectId, updateId, owner, { platforms: ["twitter"] });

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    await deleteProjectShare(share.id, owner);

    const [call] = fetchMock.mock.calls.slice(-1);
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe("https://social.test/api/post");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ id: "ayr-post-3" });

    expect(rows()[0]?.status).toBe("deleted");
  });
});

describe("share history", () => {
  it("is visible to editors only and newest first", async () => {
    const { owner, projectId } = await projectWithUpdate();
    const stranger = await makeUser();

    expect(() => listProjectShares(projectId, stranger)).toThrow();
    expect(listProjectShares(projectId, owner)).toEqual([]);
  });
});
