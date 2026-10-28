/**
 * AI story generation.
 *
 * The provider interface is the seam a hosted LLM/video service plugs into.
 * The default `local` provider is deterministic and non-generative: it composes
 * narration only from approved source records, cites each scene back to its
 * source row, and reports gaps instead of inventing content.
 */
import type { FactStatus } from "@/lib/types";
import { truncate } from "@/lib/format";

export type StorySourceKind = "work_log" | "milestone" | "update" | "task" | "deliverable";

export type StorySource = {
  kind: StorySourceKind;
  id: string;
  title: string;
  body: string;
  at: string;
  contributors: { userId: string; name: string }[];
  approved: boolean;
};

export type StoryInput = {
  projectTitle: string;
  projectSummary: string;
  sources: StorySource[];
  /** Contributors who have explicitly granted public-story consent. */
  consentedUserIds: string[];
  includeOpening: boolean;
};

export type SceneDraft = {
  title: string;
  narration: string;
  visualDescription: string;
  motion: string;
  durationSeconds: number;
  sourceType: StorySourceKind | null;
  sourceId: string | null;
  contributors: { userId: string; name: string }[];
  factStatus: FactStatus;
  aiGenerated: boolean;
};

export type StoryboardDraft = {
  title: string;
  summary: string;
  scenes: SceneDraft[];
  warnings: string[];
  usedSourceIds: string[];
};

export interface StoryProvider {
  readonly id: string;
  generateStoryboard(input: StoryInput): Promise<StoryboardDraft>;
  renderExplainer(storyboard: { title: string; summary: string }, scenes: SceneDraft[]): Promise<Buffer>;
}

const MOTIONS = ["rise", "pan", "zoom", "fade"] as const;

class LocalStoryProvider implements StoryProvider {
  readonly id = "local";

  async generateStoryboard(input: StoryInput): Promise<StoryboardDraft> {
    const warnings: string[] = [];
    const scenes: SceneDraft[] = [];
    const usedSourceIds: string[] = [];

    if (input.includeOpening) {
      scenes.push({
        title: input.projectTitle,
        narration: input.projectSummary || input.projectTitle,
        visualDescription: `Title card for ${input.projectTitle} with project category and stage`,
        motion: "rise",
        durationSeconds: 5,
        sourceType: null,
        sourceId: null,
        contributors: [],
        // The opening card restates the project's own description.
        factStatus: input.projectSummary ? "documented" : "needs_review",
        aiGenerated: false,
      });
    }

    const usable = input.sources
      .filter((source) => source.approved)
      .sort((a, b) => a.at.localeCompare(b.at));

    for (const source of usable) {
      const contributorsWithoutConsent = source.contributors.filter(
        (person) => !input.consentedUserIds.includes(person.userId),
      );
      if (contributorsWithoutConsent.length > 0) {
        warnings.push(
          `Excluded "${source.title}" because ${contributorsWithoutConsent
            .map((person) => person.name)
            .join(", ")} has not consented to public story use.`,
        );
        continue;
      }
      if (!source.body.trim()) {
        warnings.push(`"${source.title}" has no written detail, so it was left out of the narration.`);
        continue;
      }

      scenes.push({
        title: truncate(source.title, 80),
        narration: truncate(source.body.replace(/[#*_>`]/g, ""), 320),
        visualDescription: `Source card: ${source.kind.replace("_", " ")} — ${source.title}`,
        motion: MOTIONS[scenes.length % MOTIONS.length],
        durationSeconds: Math.min(12, Math.max(5, Math.round(source.body.length / 42))),
        sourceType: source.kind,
        sourceId: source.id,
        contributors: source.contributors,
        factStatus: "documented",
        aiGenerated: false,
      });
      usedSourceIds.push(source.id);
    }

    if (scenes.length <= 1) {
      warnings.push(
        "There is not enough approved documentation to build a story. Approve work-log entries, milestones or updates and try again.",
      );
    }

    return {
      title: `${input.projectTitle} — the build story`,
      summary: input.projectSummary || `How ${input.projectTitle} came together, told from its documented record.`,
      scenes,
      warnings,
      usedSourceIds,
    };
  }

  /**
   * Renders a self-contained animated SVG (CSS keyframes inside the SVG). This
   * is the honest fallback for a hosted motion-graphics render: it is a real,
   * playable animated artefact built only from the approved storyboard.
   */
  async renderExplainer(storyboard: { title: string; summary: string }, scenes: SceneDraft[]): Promise<Buffer> {
    const width = 1280;
    const height = 720;
    const total = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) || 1;
    let cursor = 0;

    const slides = scenes
      .map((scene, index) => {
        const start = cursor;
        cursor += scene.durationSeconds;
        const startPct = (start / total) * 100;
        const endPct = (cursor / total) * 100;
        const fade = Math.min(3, (1.2 / total) * 100);
        const inPct = startPct + fade;
        const outPct = Math.max(inPct + 0.5, endPct - fade);
        const lines = wrap(scene.narration, 62).slice(0, 5);
        const credits = scene.contributors.map((person) => person.name).join(" · ");
        const sourceLabel = scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : "Project description";

        return `
        <g class="slide s${index}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="#222226"/>
          <circle cx="${180 + (index % 3) * 340}" cy="${520 - (index % 2) * 90}" r="260" fill="#b8b8c1" opacity="0.1"/>
          <text x="96" y="150" fill="#b8b8c1" font-size="22" font-family="Segoe UI, Arial, sans-serif" letter-spacing="3">SCENE ${String(
            index + 1,
          ).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}</text>
          <text x="96" y="222" fill="#ffffff" font-size="44" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(
            truncate(scene.title, 46),
          )}</text>
          ${lines
            .map(
              (line, lineIndex) =>
                `<text x="96" y="${290 + lineIndex * 44}" fill="#e7e7eb" font-size="28" font-family="Segoe UI, Arial, sans-serif">${escapeXml(
                  line,
                )}</text>`,
            )
            .join("")}
          <rect x="96" y="612" width="${Math.max(160, scene.title.length * 9)}" height="34" rx="17" fill="#34343a"/>
          <text x="112" y="635" fill="#b8b8c1" font-size="17" font-family="Segoe UI, Arial, sans-serif">${escapeXml(
            sourceLabel,
          )}</text>
          ${
            credits
              ? `<text x="96" y="682" fill="#777780" font-size="18" font-family="Segoe UI, Arial, sans-serif">Contributors: ${escapeXml(
                  truncate(credits, 90),
                )}</text>`
              : ""
          }
        </g>
        <style>
          @keyframes k${index} {
            0% { opacity: 0; }
            ${inPct.toFixed(2)}% { opacity: 1; }
            ${outPct.toFixed(2)}% { opacity: 1; }
            ${endPct.toFixed(2)}% { opacity: 0; }
            100% { opacity: 0; }
          }
          .s${index} { opacity: 0; animation: k${index} ${total}s linear infinite; }
        </style>`;
      })
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(
      storyboard.title,
    )}">
      <title>${escapeXml(storyboard.title)}</title>
      <desc>${escapeXml(storyboard.summary)}</desc>
      <style>
        @media (prefers-reduced-motion: reduce) { g.slide { animation: none !important; opacity: 0; } g.slide.s0 { opacity: 1; } }
      </style>
      ${slides || `<rect width="${width}" height="${height}" fill="#222226"/>`}
    </svg>`;

    return Buffer.from(svg, "utf8");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export function getStoryProvider(): StoryProvider {
  // Hosted providers would be selected here from env.AI_PROVIDER. The local
  // provider is the only shipped implementation; anything else is a documented
  // integration point rather than a silent fallback.
  return new LocalStoryProvider();
}
