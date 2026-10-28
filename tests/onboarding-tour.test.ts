import { describe, expect, it } from "vitest";
import { getPreferences, updatePreferences } from "@/services/users";
import { makeUser } from "./helpers";

describe("first-run app guidance", () => {
  it("starts unset for a brand-new account", async () => {
    const user = await makeUser();
    expect(getPreferences(user.id)?.appTourStatus).toBeNull();
  });

  it("records both a finished tour and a skipped tour", async () => {
    const user = await makeUser();

    updatePreferences(user.id, { appTourStatus: "completed" });
    expect(getPreferences(user.id)?.appTourStatus).toBe("completed");

    updatePreferences(user.id, { appTourStatus: "skipped" });
    expect(getPreferences(user.id)?.appTourStatus).toBe("skipped");
  });

  it("does not overwrite unrelated preferences when the tour is dismissed", async () => {
    const user = await makeUser();
    updatePreferences(user.id, {
      categories: ["design", "community"],
      interests: ["accessibility", "research"],
      allowDirectMessages: "everyone",
      shareLearningHistory: true,
    });

    updatePreferences(user.id, { appTourStatus: "skipped" });

    const preferences = getPreferences(user.id)!;
    expect(preferences.appTourStatus).toBe("skipped");
    expect(preferences.categories).toEqual(["design", "community"]);
    expect(preferences.interests).toEqual(["accessibility", "research"]);
    expect(preferences.allowDirectMessages).toBe("everyone");
    expect(preferences.shareLearningHistory).toBe(true);
  });
});
