"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
// Only the Settings control remains: the header no longer carries a theme toggle.

import { cn } from "@/components/ui";
import { THEME_CHOICES, THEME_COOKIE, THEME_STORAGE_KEY, isThemeChoice, type ThemeChoice } from "@/lib/theme";

function apply(choice: ThemeChoice): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the cookie below still carries the choice.
  }
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}

function read(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeChoice(stored)) return stored;
  } catch {
    // ignore
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=(light|dark|system)`));
  const value = match?.[1];
  return isThemeChoice(value) ? value : "system";
}

/**
 * Segmented control for Settings. The choice applies immediately and is stored locally,
 * so it survives a refresh and stays with the person across sign-ins on this device.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setChoice(read());
    setMounted(true);
  }, []);

  const icons = { light: Sun, dark: Moon, system: Monitor } as const;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-3", className)} role="radiogroup" aria-label="Colour theme">
      {THEME_CHOICES.map((option) => {
        const Icon = icons[option.value];
        const active = mounted ? choice === option.value : false;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              setChoice(option.value);
              apply(option.value);
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition",
              active
                ? "border-brand-500 bg-brand-50 text-navy-900 shadow-sm"
                : "border-navy-200 bg-surface text-navy-700 hover:border-navy-300 hover:bg-navy-50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-brand-600 text-on-brand" : "bg-navy-100 text-navy-600",
              )}
              aria-hidden="true"
            >
              <Icon size={15} />
            </span>
            <span>
              <span className="block text-[13px] font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-4 text-navy-500">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}


