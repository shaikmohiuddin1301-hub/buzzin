import type { Config } from "tailwindcss";

/**
 * Design system tokens.
 *
 * Every colour resolves to a CSS variable defined in `src/app/globals.css`, so the same
 * class names work in light and dark mode. The `navy` ramp carries the graphite/silver
 * neutral scale (50 = quietest surface, 950 = strongest text); in dark mode the ramp is
 * inverted, which keeps `text-navy-900`, `border-navy-200` and `bg-navy-50` semantically
 * correct everywhere without a second set of classes. `brand` is graphite, not blue: the
 * system contains no blue, navy, indigo, violet or purple.
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function ramp(name: string, shades: readonly number[] = SHADES): Record<string, string> {
  return Object.fromEntries(shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));
}

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: ramp("navy", [...SHADES, 950]),
        brand: ramp("brand"),
        coral: ramp("coral"),
        // State colours are re-tinted rather than inverted, so success stays green-ish
        // and danger stays red-ish in both themes.
        emerald: ramp("emerald"),
        amber: ramp("amber"),
        red: ramp("red"),
        info: ramp("info"),
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          muted: "rgb(var(--surface-muted) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle) / <alpha-value>)",
        },
        page: {
          warm: "rgb(var(--page-warm) / <alpha-value>)",
          secondary: "rgb(var(--page-secondary) / <alpha-value>)",
        },
        // Text/icon colour that sits on a filled semantic action.
        on: {
          brand: "rgb(var(--on-brand) / <alpha-value>)",
          coral: "rgb(var(--on-coral) / <alpha-value>)",
          teal: "rgb(var(--on-teal) / <alpha-value>)",
          danger: "rgb(var(--on-danger) / <alpha-value>)",
          caution: "rgb(var(--on-caution) / <alpha-value>)",
        },
        // Task/project work states, kept separate from decorative brand accents.
        status: {
          todo: "rgb(var(--status-todo) / <alpha-value>)",
          "todo-text": "rgb(var(--status-todo-text) / <alpha-value>)",
          progress: "rgb(var(--status-progress) / <alpha-value>)",
          "progress-text": "rgb(var(--status-progress-text) / <alpha-value>)",
          review: "rgb(var(--status-review) / <alpha-value>)",
          "review-text": "rgb(var(--status-review-text) / <alpha-value>)",
          approved: "rgb(var(--status-approved) / <alpha-value>)",
          "approved-text": "rgb(var(--status-approved-text) / <alpha-value>)",
          blocked: "rgb(var(--status-blocked) / <alpha-value>)",
          "blocked-text": "rgb(var(--status-blocked-text) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        floating: "1.75rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        float: "var(--shadow-float)",
        glow: "var(--shadow-glow)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 0.7, 0.24, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
