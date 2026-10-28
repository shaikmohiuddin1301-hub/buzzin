"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Compass, Home, MessageSquare, Plus, UserRound, X } from "lucide-react";
import { saveAppTourStatusAction } from "@/app/actions/account";
import { cn } from "@/components/ui";

/**
 * First-time app guidance.
 *
 * The tour is deliberately five short stops over the navigation, not a tutorial
 * that gates the product. It is shown once to an account whose preference is still
 * unset; skipping and finishing both count as "seen". The same component is used
 * when the tour is reopened from Settings & Account.
 *
 * Nothing is stored only in React state: the server preference controls the next
 * session, and a local marker keeps the same device quiet if that write fails.
 */

type Step = {
  id: "home" | "explore" | "create" | "chats" | "profile";
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Home;
};

const STEPS: Step[] = [
  {
    id: "home",
    eyebrow: "Home",
    title: "Your community at a glance",
    body: "See updates from people and projects you follow, and find out what is happening in your network.",
    icon: Home,
  },
  {
    id: "explore",
    eyebrow: "Explore",
    title: "Find something worth joining",
    body: "Discover projects, people, ideas and learning content. Use search when you know what you are looking for.",
    icon: Compass,
  },
  {
    id: "create",
    eyebrow: "Create",
    title: "Make something and share it",
    body: "Share a post or a learning, start a project, post progress, or build teaching and a structured course.",
    icon: Plus,
  },
  {
    id: "chats",
    eyebrow: "Chats",
    title: "Talk to the people you build with",
    body: "Connect and communicate with other people when messaging is available to you.",
    icon: MessageSquare,
  },
  {
    id: "profile",
    eyebrow: "Profile",
    title: "Your work in one place",
    body: "Show who you are and keep your posts, projects, learnings and teaching together on one profile.",
    icon: UserRound,
  },
];

type Rect = { top: number; left: number; width: number; height: number };
type Stage = "closed" | "welcome" | "tour";

function findVisibleTarget(id: Step["id"]): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
  return (
    candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }) ?? null
  );
}

export function AppTour({ autoStart, userId }: { autoStart: boolean; userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>("closed");
  const [index, setIndex] = useState(0);
  const [replay, setReplay] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const dialogRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const storageKey = `bt:app-tour:${userId}`;
  const step = STEPS[index];

  // The server owns the durable answer. The local marker is the fallback for a
  // device whose preference write failed, and for an immediate reload.
  useEffect(() => {
    if (!autoStart || replay || searchParams.get("tour") === "1") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      // Storage can be unavailable in private modes. The server preference still
      // decides; the tour simply cannot use the local fallback.
    }
    setStage("welcome");
  }, [autoStart, replay, searchParams, storageKey]);

  // Opening the tour from Settings uses a query parameter so it never clears the
  // saved preference or writes anything else. The parameter is removed immediately
  // so a refresh does not reopen the guide unexpectedly.
  useEffect(() => {
    if (searchParams.get("tour") !== "1") return;
    setReplay(true);
    setIndex(0);
    setStage("tour");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("tour");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const dismiss = useCallback(
    (status: "completed" | "skipped") => {
      setStage("closed");
      setIndex(0);
      setRect(null);
      // A reopened tour for someone who has already answered is a read-only guide:
      // closing it leaves the saved preference alone. If the replay belongs to an
      // account whose status is still unset (autoStart), the answer is a first-run
      // answer and must be stored. Nothing waits on the request.
      if (replay && !autoStart) return;
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // Nothing to do; the user is already back in the app.
      }
      void saveAppTourStatusAction(status).catch(() => {
        // The local marker still suppresses this device's welcome screen.
      });
    },
    [autoStart, replay, storageKey],
  );

  const measure = useCallback(() => {
    if (stage !== "tour") {
      setRect(null);
      return;
    }
    const target = findVisibleTarget(STEPS[index].id);
    if (!target) {
      setRect(null);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      return;
    }
    const bounds = target.getBoundingClientRect();
    setRect({ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height });
    setViewport({ width: window.innerWidth, height: window.innerHeight });
  }, [index, stage]);

  useEffect(() => {
    if (stage !== "tour") return;
    measure();
    // A route change can replace the navigation after the first measurement.
    const retry = window.setTimeout(measure, 120);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure, stage]);

  // Move focus into the guidance so keyboard and screen-reader users hear the
  // step that just opened, and put focus back where it came from on close.
  useEffect(() => {
    if (stage === "closed") return;
    if (!restoreFocusRef.current && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    const node = stage === "welcome" ? dialogRef.current : cardRef.current;
    node?.focus();
  }, [index, stage]);

  useEffect(() => {
    if (stage !== "closed") return;
    const previous = restoreFocusRef.current;
    restoreFocusRef.current = null;
    previous?.focus();
  }, [stage]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss("skipped");
      return;
    }
    if (event.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => element.getBoundingClientRect().width > 0);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(380px, calc(100vw - 24px))",
      };
    }
    if (viewport.width < 1024) {
      return {
        left: 12,
        right: 12,
        bottom: Math.max(12, viewport.height - rect.top + 14),
        maxHeight: Math.max(190, rect.top - 28),
      };
    }
    return {
      left: Math.min(rect.left + rect.width + 16, viewport.width - 392),
      top: Math.min(Math.max(rect.top - 28, 12), Math.max(12, viewport.height - 330)),
      width: 368,
    };
  }, [rect, viewport]);

  if (stage === "closed") return null;

  if (stage === "welcome") {
    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-welcome-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 outline-none backdrop-blur-sm motion-fade"
      >
        <div data-tour-card="welcome" className="glass-popover w-full max-w-md rounded-3xl p-6 shadow-float">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-coral-500 text-white shadow-sm">
            <BookOpen size={21} aria-hidden="true" />
          </span>
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand-600">Welcome</p>
          <h2 id="app-tour-welcome-title" className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-navy-950">
            Welcome to BuildTogether
          </h2>
          <p className="mt-2 text-[13.5px] leading-6 text-navy-600">
            Discover projects, share what you learn, collaborate with others, and turn ideas into something real.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setStage("tour");
              }}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-coral-500 px-4 text-[14px] font-semibold text-on-coral shadow-sm transition hover:bg-coral-600"
            >
              Take a quick tour
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => dismiss("skipped")}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-navy-200 bg-surface px-4 text-[13.5px] font-medium text-navy-700 transition hover:bg-navy-50"
            >
              Skip guidance
            </button>
          </div>
          <p className="mt-3 text-[10.5px] leading-4 text-navy-400">
            You can replay this any time from Settings &amp; Account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-tour-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[80] outline-none"
    >
      {rect ? (
        <div
          aria-hidden="true"
          data-tour-spotlight="true"
          className="pointer-events-none fixed z-0 rounded-2xl"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            border: "2px solid #FF785A",
            boxShadow: "0 0 0 9999px rgba(8, 10, 14, 0.55)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-0 bg-black/55" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        data-tour-card="step"
        style={cardStyle}
        className={cn(
          "glass-popover fixed z-10 overflow-y-auto rounded-2xl p-4 outline-none shadow-float",
          "focus-visible:ring-2 focus-visible:ring-brand-500/40",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600">
              {step.eyebrow} · {index + 1} of {STEPS.length}
            </p>
            <h2 id="app-tour-title" className="mt-1 text-[17px] font-semibold leading-6 tracking-tight text-navy-950">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dismiss("skipped")}
            aria-label="Close tour"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100 hover:text-navy-800"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex items-start gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <step.icon size={17} aria-hidden="true" />
          </span>
          <p className="text-[12.5px] leading-5 text-navy-600">{step.body}</p>
        </div>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((entry, entryIndex) => (
            <span
              key={entry.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                entryIndex === index ? "w-5 bg-coral-500" : "w-1.5 bg-navy-200",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-navy-200 pt-3">
          <button
            type="button"
            onClick={() => dismiss("skipped")}
            className="text-[11.5px] font-medium text-navy-500 underline-offset-2 hover:text-navy-800 hover:underline"
          >
            Skip tour
          </button>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex((current) => Math.max(0, current - 1))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 text-[12.5px] font-medium text-navy-700 transition hover:bg-navy-50"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </button>
            ) : null}
            {index < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[12.5px] font-semibold text-on-brand shadow-sm transition hover:bg-brand-700"
              >
                Next
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dismiss("completed")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-[12.5px] font-semibold text-on-teal shadow-sm transition hover:bg-emerald-600"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
