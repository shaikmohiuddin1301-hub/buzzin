import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { addComment, createPost, toggleReaction } from "@/services/social";
import {
  addMilestone,
  createProject,
  postProjectUpdate,
  projectDetail,
  publishProject,
  setMilestoneStatus,
  toggleProjectFollow,
  updateProject,
} from "@/services/projects";
import { assignContributor, createTask, listTasks, upcomingDeadlines } from "@/services/tasks";
import { createWorkArea } from "@/services/workAreas";
import { blockUser, followUser } from "@/services/users";
import {
  commentsByUser,
  countCommentsByUser,
  countLikedPosts,
  countLikedProjects,
  likedPostsForUser,
  likedProjectsForUser,
} from "@/services/library";
import { followingActivity } from "@/services/activity";
import { makeProject, makeUser, projectInput } from "./helpers";

function publicPost(authorId: string, body: string) {
  return createPost(authorId, { body, kind: "general", visibility: "public", publish: true });
}

describe("liked posts", () => {
  it("lists liked posts with their author, counts them, and forgets an unliked one", async () => {
    const viewer = await makeUser();
    const author = await makeUser();
    const first = publicPost(author.id, "The first thing worth liking on this platform.");
    const second = publicPost(author.id, "A second post that is also long enough to be useful.");

    toggleReaction(viewer.id, "post", first, "like");
    toggleReaction(viewer.id, "post", second, "like");

    const liked = likedPostsForUser(viewer.id);
    expect(liked).toHaveLength(2);
    expect(liked.map((post) => post.id)).toEqual(expect.arrayContaining([first, second]));
    expect(liked.every((post) => post.authorUsername === author.username)).toBe(true);
    expect(countLikedPosts(viewer.id)).toBe(2);

    toggleReaction(viewer.id, "post", first, "like");
    expect(likedPostsForUser(viewer.id).map((post) => post.id)).toEqual([second]);
    expect(countLikedPosts(viewer.id)).toBe(1);
  });

  it("drops a liked post that later becomes private", async () => {
    const viewer = await makeUser();
    const author = await makeUser();
    const postId = publicPost(author.id, "This post will be hidden after it has been liked by someone.");
    toggleReaction(viewer.id, "post", postId, "like");
    expect(likedPostsForUser(viewer.id)).toHaveLength(1);

    getDb().update(posts).set({ visibility: "private" }).where(eq(posts.id, postId)).run();
    expect(likedPostsForUser(viewer.id)).toHaveLength(0);
    expect(countLikedPosts(viewer.id)).toBe(0);
  });
});

describe("liked projects", () => {
  it("lists a liked public project and hides it once it is made private", async () => {
    const viewer = await makeUser();
    const owner = await makeUser();
    const { id } = makeProject(owner.id, { name: "Public project to like" });

    toggleReaction(viewer.id, "project", id, "like");
    expect(likedProjectsForUser(viewer.id).map((project) => project.id)).toEqual([id]);
    expect(countLikedProjects(viewer.id)).toBe(1);

    updateProject(id, owner, { visibility: "private" });
    expect(likedProjectsForUser(viewer.id)).toHaveLength(0);
    expect(countLikedProjects(viewer.id)).toBe(0);
  });
});

describe("your comments", () => {
  it("lists comments on other people's content with a real destination", async () => {
    const author = await makeUser();
    const commenter = await makeUser();
    const postId = publicPost(author.id, "A post that will collect a comment from another account.");
    const { id: projectId } = makeProject(author.id, { name: "Commented project" });

    addComment(commenter.id, { targetType: "post", targetId: postId, body: "This is useful, thank you." });
    addComment(commenter.id, { targetType: "project", targetId: projectId, body: "Happy to help with research." });

    const comments = commentsByUser(commenter.id);
    expect(comments).toHaveLength(2);
    expect(countCommentsByUser(commenter.id)).toBe(2);
    expect(comments.find((comment) => comment.targetType === "post")?.targetHref).toBe(`/posts/${postId}`);
    expect(comments.find((comment) => comment.targetType === "project")?.targetTitle).toBe("Commented project");
  });

  it("excludes the account's own posts", async () => {
    const owner = await makeUser();
    const ownPost = publicPost(owner.id, "My own post, which should not appear in my comment history.");
    addComment(owner.id, { targetType: "post", targetId: ownPost, body: "A note on my own post." });

    expect(commentsByUser(owner.id)).toHaveLength(0);
    expect(countCommentsByUser(owner.id)).toBe(0);
  });

  it("drops a comment once the project it belongs to becomes private", async () => {
    const owner = await makeUser();
    const commenter = await makeUser();
    const { id } = makeProject(owner.id, { name: "Later private project" });
    addComment(commenter.id, { targetType: "project", targetId: id, body: "Looking forward to this one." });
    expect(countCommentsByUser(commenter.id)).toBe(1);

    updateProject(id, owner, { visibility: "private" });
    expect(commentsByUser(commenter.id)).toHaveLength(0);
    expect(countCommentsByUser(commenter.id)).toBe(0);
  });
});

describe("around your network", () => {
  it("is empty until something is followed", async () => {
    const user = await makeUser();
    expect(followingActivity(user.id)).toEqual([]);
  });

  it("brings in real activity from followed accounts and projects only", async () => {
    const viewer = await makeUser();
    const followed = await makeUser();
    const stranger = await makeUser();

    const followedPost = publicPost(followed.id, "A post from somebody this account follows, long enough to show up.");
    const strangerPost = publicPost(stranger.id, "A post from an account nobody is following, which must not appear.");

    const { id: projectId } = makeProject(followed.id, { name: "Followed project" });
    const areaId = createWorkArea(projectId, followed, { name: "Research" });
    const taskId = createTask(projectId, followed, {
      title: "Interview five river volunteers",
      acceptanceCriteria: "Five written summaries are attached to the task.",
      compensationType: "unpaid",
      compensationDetails: "Portfolio credit",
      visibility: "public",
      skills: [],
      publish: true,
      workAreaId: areaId,
    });
    addMilestone(projectId, followed, { title: "Prototype assembled" });
    const milestoneId = projectDetail(projectId, followed)!.milestones[0]!.id;
    setMilestoneStatus(milestoneId, followed, "completed");
    postProjectUpdate(projectId, followed, {
      title: "Field notes from the first week",
      body: "We deployed two sensors and both are reporting.",
      visibility: "public",
    });

    // Nothing yet: no follow on either side.
    expect(followingActivity(viewer.id).map((item) => item.id)).not.toContain(`post:${followedPost}`);

    followUser(viewer.id, followed.id);
    toggleProjectFollow(projectId, viewer.id);

    const items = followingActivity(viewer.id);
    const ids = items.map((item) => item.id);
    expect(ids).toContain(`post:${followedPost}`);
    expect(ids).toContain(`milestone:${milestoneId}`);
    expect(ids).toContain(`recruiting:${taskId}`);
    expect(ids.some((id) => id.startsWith("update:"))).toBe(true);
    expect(ids).not.toContain(`post:${strangerPost}`);
    expect(items.every((item) => item.href.startsWith("/"))).toBe(true);
    expect(items.every((item) => item.timestamp.length > 0)).toBe(true);
    // Newest first, whatever order the individual queries came back in.
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index - 1]!.timestamp >= items[index]!.timestamp).toBe(true);
    }
  });

  it("never shows private work, even on a followed project", async () => {
    const viewer = await makeUser();
    const owner = await makeUser();
    const { id } = createProject(owner.id, projectInput({ visibility: "public" }));
    publishProject(id, owner);
    toggleProjectFollow(id, viewer.id);

    const privateTask = createTask(id, owner, {
      title: "Internal bookkeeping nobody outside the team should see",
      acceptanceCriteria: "Filed and reconciled with the ledger.",
      compensationType: "unpaid",
      compensationDetails: "Credit",
      visibility: "private",
      skills: [],
      publish: true,
    });

    expect(followingActivity(viewer.id).map((item) => item.id)).not.toContain(`recruiting:${privateTask}`);

    updateProject(id, owner, { visibility: "private" });
    expect(followingActivity(viewer.id)).toHaveLength(0);
  });

  it("never shows activity from an account the viewer has blocked", async () => {
    const viewer = await makeUser();
    const blocked = await makeUser();
    const postId = publicPost(blocked.id, "A post from an account that will be blocked by the viewer.");
    followUser(viewer.id, blocked.id);
    expect(followingActivity(viewer.id).map((item) => item.id)).toContain(`post:${postId}`);

    blockUser(viewer.id, blocked.id);
    expect(followingActivity(viewer.id).map((item) => item.id)).not.toContain(`post:${postId}`);
  });
});

describe("assigned and unassigned work", () => {
  it("puts an assigned task in the contributor's work view and leaves the other task open", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id } = makeProject(owner.id, { name: "Assignment project" });

    const assigned = createTask(id, owner, {
      title: "Write the onboarding guide",
      acceptanceCriteria: "The guide covers every step a new volunteer takes.",
      compensationType: "unpaid",
      compensationDetails: "Portfolio credit",
      visibility: "public",
      skills: [],
      publish: true,
    });
    assignContributor(assigned, owner, contributor.id);

    const open = createTask(id, owner, {
      title: "Design the sensor housing",
      acceptanceCriteria: "A printable case that fits the board.",
      compensationType: "unpaid",
      compensationDetails: "Portfolio credit",
      visibility: "public",
      skills: [],
      publish: true,
    });

    const mine = upcomingDeadlines(contributor.id);
    expect(mine.map((row) => row.task.id)).toContain(assigned);
    expect(mine.map((row) => row.task.id)).not.toContain(open);

    const openRow = listTasks(id, owner).find((task) => task.id === open);
    expect(openRow?.status).toBe("open");
  });
});
