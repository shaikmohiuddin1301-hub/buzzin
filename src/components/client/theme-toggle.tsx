"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
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
                active ? "bg-brand-600 text-white" : "bg-navy-100 text-navy-600",
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

/**
 * Small header control: flips between light and dark using the current resolved theme.
 * Keyboard reachable, labelled, and only rendered as a button (so it never lies about state
 * before hydration).
 */
export function QuickThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = dark ? "light" : "dark";
        setDark(!dark);
        apply(next);
      }}
      aria-label={mounted && dark ? "Switch to light theme" : "Switch to dark theme"}
      title={mounted && dark ? "Light theme" : "Dark theme"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-navy-600 transition hover:bg-navy-100 hover:text-navy-900",
        className,
      )}
    >
      <span aria-hidden="true" className="relative block h-4 w-4">
        <Sun
          size={16}
          className={cn("absolute inset-0 transition-all duration-200", dark ? "rotate-90 opacity-0" : "rotate-0 opacity-100")}
        />
        <Moon
          size={16}
          className={cn("absolute inset-0 transition-all duration-200", dark ? "rotate-0 opacity-100" : "-rotate-90 opacity-0")}
        />
      </span>
    </button>
  );
}
