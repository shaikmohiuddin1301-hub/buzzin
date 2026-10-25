"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/components/ui";

export type PlayerScene = {
  id: string;
  title: string;
  narration: string;
  visualDescription: string | null;
  durationSeconds: number;
  sourceLabel: string | null;
  contributors: string[];
  factStatus: string;
  aiGenerated: boolean;
};

/**
 * Scene-by-scene animated explainer.
 *
 * Never autoplays with sound, always shows the narration as text (captions),
 * pauses when the document is hidden, and offers a static mode for users who
 * prefer reduced motion.
 */
export function StoryPlayer({ scenes, title }: { scenes: PlayerScene[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const scene = scenes[index];

  useEffect(() => {
    if (!playing || !scene || reduced) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1 < scenes.length ? current + 1 : 0));
    }, Math.max(3, scene.durationSeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, index, scene, scenes.length, reduced]);

  useEffect(() => {
    if (!playing) return;
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [playing]);

  const total = useMemo(() => scenes.reduce((sum, item) => sum + item.durationSeconds, 0), [scenes]);

  if (!scene) {
    return <p className="text-sm text-navy-500">This story has no scenes yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-navy-800 bg-navy-950 text-white">
      <div
        ref={regionRef}
        className="relative flex min-h-[300px] flex-col justify-between gap-6 p-6 sm:min-h-[380px] sm:p-8"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${title} — scene ${index + 1} of ${scenes.length}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 60% at 20% 30%, rgba(109,74,255,0.35), transparent 70%), radial-gradient(40% 40% at 85% 80%, rgba(90,120,255,0.18), transparent 70%)",
          }}
        />

        <div className="relative flex items-start justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">
            Scene {index + 1} / {scenes.length}
          </p>
          <div className="flex items-center gap-2 text-[10px]">
            {scene.factStatus === "documented" ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">Documented fact</span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300">Needs review</span>
            )}
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-navy-100">
              {scene.aiGenerated ? "AI narration" : "Human written"}
            </span>
          </div>
        </div>

        <div className={cn("relative", playing && !reduced && "animate-fade-in")} key={scene.id}>
          <h3 className="max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">{scene.title}</h3>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-navy-100">{scene.narration}</p>
        </div>

        <div className="relative space-y-2">
          {scene.contributors.length > 0 ? (
            <p className="text-xs text-navy-300">Contributors: {scene.contributors.join(" · ")}</p>
          ) : null}
          {scene.sourceLabel ? <p className="text-xs text-navy-400">{scene.sourceLabel}</p> : null}
          {scene.visualDescription ? (
            <details className="text-xs text-navy-300">
              <summary className="cursor-pointer select-none hover:text-white">Visual direction</summary>
              <p className="mt-1 text-navy-400">{scene.visualDescription}</p>
            </details>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-navy-900/60 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex((current) => Math.max(0, current - 1));
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-navy-200 hover:bg-white/10"
          aria-label="Previous scene"
          disabled={index === 0}
        >
          <SkipBack size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          disabled={reduced}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          aria-label={playing ? "Pause story" : "Play story"}
        >
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex((current) => Math.min(scenes.length - 1, current + 1));
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-navy-200 hover:bg-white/10"
          aria-label="Next scene"
          disabled={index === scenes.length - 1}
        >
          <SkipForward size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-navy-200 hover:bg-white/10"
          aria-label="Restart story"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>

        <p className="ml-auto text-[11px] text-navy-300">
          {reduced ? "Reduced motion is on — use the scene buttons." : `${total}s total · no audio autoplay`}
        </p>
      </div>

      <div className="flex gap-1.5 border-t border-white/10 px-4 py-3" aria-hidden="true">
        {scenes.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            onClick={() => {
              setPlaying(false);
              setIndex(itemIndex);
            }}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              itemIndex === index ? "bg-brand-400" : "bg-white/20 hover:bg-white/40",
            )}
            title={item.title}
          />
        ))}
      </div>
    </div>
  );
}
