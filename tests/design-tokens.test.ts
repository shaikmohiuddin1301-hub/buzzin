import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The palette is the design system: every component resolves to these variables, so
 * this test protects the exact brand values and the contrast guarantees they carry.
 */
const css = readFileSync("src/app/globals.css", "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n}", start);
  if (start < 0 || end < 0) throw new Error(`Missing ${selector} block`);
  return css.slice(start, end);
}

function vars(source: string): Record<string, [number, number, number]> {
  const found: Record<string, [number, number, number]> = {};
  for (const match of source.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)) {
    found[match[1]!] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return found;
}

const light = vars(block(":root"));
const dark = vars(block(".dark"));

const hex = (rgb: [number, number, number]) =>
  `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [first, second] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (first + 0.05) / (second + 0.05);
}

describe("graphite glass palette", () => {
  it("uses the exact light tokens", () => {
    expect(hex(light["brand-600"]!)).toBe("#34343A");
    expect(hex(light["brand-700"]!)).toBe("#222226");
    expect(hex(light["coral-500"]!)).toBe("#FF785A");
    expect(hex(light["emerald-500"]!)).toBe("#169B75");
    expect(hex(light["emerald-600"]!)).toBe("#0F7A5C");
    expect(hex(light["amber-300"]!)).toBe("#D9AD55");
    expect(hex(light["brand-50"]!)).toBe("#EEEEF0");
    expect(hex(light["page-warm"]!)).toBe("#F5F5F3");
    expect(hex(light["page-secondary"]!)).toBe("#E7E7EB");
    expect(hex(light["surface"]!)).toBe("#FFFFFF");
    expect(hex(light["navy-900"]!)).toBe("#34343A");
    expect(hex(light["navy-600"]!)).toBe("#56565F");
    expect(hex(light["navy-500"]!)).toBe("#777780");
    expect(hex(light["navy-200"]!)).toBe("#E7E7EB");
    expect(hex(light["navy-300"]!)).toBe("#B8B8C1");
    expect(hex(light["red-600"]!)).toBe("#C83D4D");
  });

  it("uses the exact dark tokens", () => {
    expect(hex(dark["surface-muted"]!)).toBe("#222226");
    expect(hex(dark["surface"]!)).toBe("#34343A");
    expect(hex(dark["surface-subtle"]!)).toBe("#414149");
    expect(hex(dark["navy-900"]!)).toBe("#F5F5F3");
    expect(hex(dark["navy-500"]!)).toBe("#B8B8C1");
    expect(hex(dark["navy-200"]!)).toBe("#484850");
    expect(hex(dark["brand-600"]!)).toBe("#E7E7EB");
    expect(hex(dark["on-brand"]!)).toBe("#222226");
    expect(hex(dark["coral-500"]!)).toBe("#FF785A");
    expect(hex(dark["emerald-500"]!)).toBe("#3FC79C");
    expect(hex(dark["amber-500"]!)).toBe("#C8A04E");
    expect(hex(dark["navy-100"]!)).toBe("#414149");
  });

  it("keeps task states separate from decorative accents", () => {
    expect(hex(light["status-todo"]!)).toBe("#E7E7EB");
    expect(hex(light["status-todo-text"]!)).toBe("#34343A");
    expect(hex(light["status-progress"]!)).toBe("#D5D5DC");
    expect(hex(light["status-progress-text"]!)).toBe("#222226");
    expect(hex(light["status-review"]!)).toBe("#FAF0DB");
    expect(hex(light["status-review-text"]!)).toBe("#5C4310");
    expect(hex(light["status-approved"]!)).toBe("#DFF4ED");
    expect(hex(light["status-approved-text"]!)).toBe("#0F7A5C");
    expect(hex(light["status-blocked"]!)).toBe("#FBE9EC");
    expect(hex(light["status-blocked-text"]!)).toBe("#A32638");
  });

  it("contains no blue, indigo or violet hue in either theme", () => {
    // A neutral silver carries a few points of blue in its channel mix (the specified
    // #B8B8C1 has nine); anything beyond that is the old palette leaking back in.
    for (const [name, value] of [...Object.entries(light), ...Object.entries(dark)]) {
      const excess = value[2] - Math.max(value[0], value[1]);
      expect(excess, `${name} is blue-dominant`).toBeLessThanOrEqual(10);
    }
  });
});

describe("colour contrast", () => {
  const pairs: [string, [number, number, number], [number, number, number], number][] = [
    ["light body on card", light["navy-900"]!, light["surface"]!, 4.5],
    ["light secondary on card", light["navy-600"]!, light["surface"]!, 4.5],
    ["light secondary on warm page", light["navy-600"]!, light["page-warm"]!, 4.5],
    ["light link on card", light["brand-600"]!, light["surface"]!, 4.5],
    ["light link on selected surface", light["brand-600"]!, light["brand-50"]!, 4.5],
    ["light primary button", light["on-brand"]!, light["brand-600"]!, 4.5],
    ["light coral label", light["on-coral"]!, light["coral-500"]!, 4.5],
    ["light destructive button", [255, 255, 255], light["red-600"]!, 4.5],
    ["light approved badge", light["status-approved-text"]!, light["status-approved"]!, 4.5],
    ["light review badge", light["status-review-text"]!, light["status-review"]!, 4.5],
    ["light blocked badge", light["status-blocked-text"]!, light["status-blocked"]!, 4.5],
    ["light todo badge", light["status-todo-text"]!, light["status-todo"]!, 4.5],
    ["dark body on card", dark["navy-900"]!, dark["surface"]!, 4.5],
    ["dark secondary on card", dark["navy-500"]!, dark["surface"]!, 4.5],
    ["dark primary action", dark["on-brand"]!, dark["brand-600"]!, 4.5],
    ["dark approved badge", dark["status-approved-text"]!, dark["status-approved"]!, 4.5],
    ["dark review badge", dark["status-review-text"]!, dark["status-review"]!, 4.5],
    ["dark blocked badge", dark["status-blocked-text"]!, dark["status-blocked"]!, 4.5],
    // Essential icons need 3:1; the darker coral stroke keeps the like control legible.
    ["coral icon on white", light["coral-600"]!, light["surface"]!, 3],
    ["teal icon on warm page", light["emerald-500"]!, light["page-warm"]!, 3],
    ["graphite action on white", light["brand-600"]!, light["surface"]!, 3],
  ];

  for (const [name, foreground, background, minimum] of pairs) {
    it(`${name} reaches ${minimum}:1`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
    });
  }
});
