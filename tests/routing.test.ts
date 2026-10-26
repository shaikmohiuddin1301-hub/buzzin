import { describe, expect, it } from "vitest";
import { safeNextPath, signInPath, withNext } from "@/lib/redirects";

describe("safeNextPath", () => {
  it("keeps internal destinations including their query and hash", () => {
    expect(safeNextPath("/home")).toBe("/home");
    expect(safeNextPath("/projects/abc?tab=tasks")).toBe("/projects/abc?tab=tasks");
    expect(safeNextPath("/tasks/123/chat#latest")).toBe("/tasks/123/chat#latest");
    expect(safeNextPath("/settings?tab=security")).toBe("/settings?tab=security");
    expect(safeNextPath("  /learn  ")).toBe("/learn");
  });

  it("rejects external, protocol-relative and malformed destinations", () => {
    for (const value of [
      "https://evil.example/steal",
      "http://evil.example",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "mailto:someone@example.test",
      "/%2F%2Fevil.example",
      "/%5Cevil.example",
      "evil.example",
      "/path\nwith-newline",
    ]) {
      expect(safeNextPath(value), value).toBe("/home");
    }
  });

  it("falls back when a percent escape is malformed", () => {
    expect(safeNextPath("/projects/%E0%A4%A")).toBe("/home");
    expect(safeNextPath("/%")).toBe("/home");
    expect(safeNextPath("%")).toBe("/home");
  });

  it("returns to Home instead of the entry or authentication screens, preventing loops", () => {
    expect(safeNextPath("/")).toBe("/home");
    expect(safeNextPath("/welcome")).toBe("/home");
    expect(safeNextPath("/auth/sign-in")).toBe("/home");
    expect(safeNextPath("/auth/sign-up?next=/home")).toBe("/home");
    expect(safeNextPath(null)).toBe("/home");
    expect(safeNextPath(undefined)).toBe("/home");
    expect(safeNextPath("")).toBe("/home");
  });

  it("accepts an explicit fallback", () => {
    expect(safeNextPath("https://evil.example", "/onboarding")).toBe("/onboarding");
  });
});

describe("signInPath", () => {
  it("encodes the requested destination", () => {
    expect(signInPath("/projects/abc")).toBe("/auth/sign-in?next=%2Fprojects%2Fabc");
    expect(signInPath("/home?filter=learning")).toBe("/auth/sign-in?next=%2Fhome%3Ffilter%3Dlearning");
  });

  it("sanitises the destination before building the URL", () => {
    expect(signInPath("https://evil.example")).toBe("/auth/sign-in?next=%2Fhome");
    expect(signInPath("/auth/sign-in")).toBe("/auth/sign-in?next=%2Fhome");
  });
});

describe("withNext", () => {
  it("preserves existing query parameters", () => {
    expect(withNext("/home?notice=Ready", "/projects/abc")).toBe("/home?notice=Ready&next=%2Fprojects%2Fabc");
    expect(withNext("/onboarding", "/tasks/1")).toBe("/onboarding?next=%2Ftasks%2F1");
  });

  it("leaves the path alone when the destination is Home", () => {
    expect(withNext("/home?notice=Ready", "/home")).toBe("/home?notice=Ready");
    expect(withNext("/onboarding", "https://evil.example")).toBe("/onboarding");
  });
});
