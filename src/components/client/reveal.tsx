"use client";

/**
 * Reveals content once, as it enters the viewport.
 *
 * Uses IntersectionObserver (no scroll handlers, no layout reads), animates only opacity and
 * transform, and unobserves as soon as the element has been shown, so scrolling back up never
 * replays the animation. When motion is reduced, or the browser cannot observe intersections,
 * the content is simply visible.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  /** Small stagger in milliseconds; keep it under ~160ms so lists feel quick. */
  delay?: number;
  className?: string;
  /** Render as a list item when the reveal is used inside a list. */
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const Tag = as;

  return (
    <Tag
      ref={ref as never}
      className={cn("reveal", visible && "is-visible", className)}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
