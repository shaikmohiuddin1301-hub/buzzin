import { describe, expect, it } from "vitest";
import { THEME_SCRIPT, isThemeChoice } from "@/lib/theme";

/**
 * The theme script runs before paint in the browser, so its logic is exercised here
 * against a minimal DOM stub: no flash of the wrong theme, saved choice wins over the OS,
 * and "system" follows the device.
 */
function runScript(options: { prefersDark: boolean; stored?: string | null; cookie?: string }) {
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const listeners: ((event: { matches: boolean }) => void)[] = [];

  const root = {
    classList: {
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
      add: (name: string) => classes.add(name),
      contains: (name: string) => classes.has(name),
    },
    dataset,
  };

  const media = {
    matches: options.prefersDark,
    addEventListener: (_: string, handler: (event: { matches: boolean }) => void) => listeners.push(handler),
  };

  const windowStub = {
    matchMedia: (query: string) =>
      query.includes("prefers-color-scheme")
        ? media
        : { matches: false, addEventListener: () => undefined },
    localStorage: {
      getItem: () => options.stored ?? null,
    },
  };

  const documentStub = {
    documentElement: root,
    cookie: options.cookie ?? "",
  };

  const fn = new Function("window", "document", "localStorage", THEME_SCRIPT);
  fn(windowStub, documentStub, windowStub.localStorage);

  return { classes, dataset, listeners };
}

describe("theme preference", () => {
  it("accepts only the three supported choices", () => {
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("solar")).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });

  it("follows the device when no choice is saved", () => {
    expect(runScript({ prefersDark: true }).classes.has("dark")).toBe(true);
    expect(runScript({ prefersDark: false }).classes.has("dark")).toBe(false);
  });

  it("uses the saved choice instead of the device setting", () => {
    expect(runScript({ prefersDark: false, stored: "dark" }).classes.has("dark")).toBe(true);
    expect(runScript({ prefersDark: true, stored: "light" }).classes.has("dark")).toBe(false);
  });

  it("falls back to the cookie when storage is unavailable", () => {
    const { classes } = runScript({ prefersDark: false, cookie: "foo=1; bt_theme=dark" });
    expect(classes.has("dark")).toBe(true);
  });

  it("sets the resolved theme on the document and enables parallax-free reveals", () => {
    const { dataset, classes } = runScript({ prefersDark: true });
    expect(dataset.theme).toBe("dark");
    expect(classes.has("motion-ready")).toBe(true);
  });

  it("keeps following the device only while the choice is system", () => {
    const systemRun = runScript({ prefersDark: false });
    expect(systemRun.listeners).toHaveLength(1);
    systemRun.listeners[0]!({ matches: true });
    expect(systemRun.classes.has("dark")).toBe(true);

    const fixedRun = runScript({ prefersDark: false, stored: "light" });
    fixedRun.listeners[0]!({ matches: true });
    expect(fixedRun.classes.has("dark")).toBe(false);
  });
});
