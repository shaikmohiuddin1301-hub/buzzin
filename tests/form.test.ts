import { describe, expect, it } from "vitest";
import { file } from "@/lib/form";

/**
 * `file()` replaced `entry instanceof File`, which throws `ReferenceError: File is not
 * defined` on Node 18 — the minimum runtime this package claims to support. These cases pin
 * the behaviour the upload actions rely on.
 */
describe("reading a file part from FormData", () => {
  it("returns null for a missing field, a text field or an empty upload", () => {
    const data = new FormData();
    expect(file(data, "missing")).toBeNull();

    data.append("text", "just a string");
    expect(file(data, "text")).toBeNull();

    data.append("empty", new Blob([]), "empty.png");
    expect(file(data, "empty")).toBeNull();
  });

  it("returns an uploaded file's bytes and declared name", async () => {
    const data = new FormData();
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    data.append("cover", new Blob([bytes], { type: "image/png" }), "cover.png");

    const part = file(data, "cover");
    expect(part).not.toBeNull();
    expect(part!.size).toBe(bytes.byteLength);
    expect((await part!.arrayBuffer()).byteLength).toBe(bytes.byteLength);
  });
});
