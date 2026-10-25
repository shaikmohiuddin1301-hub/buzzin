import type { Config } from "tailwindcss";

/**
 * Design system tokens.
 * Light theme is the default; `.dark` class hooks are wired so a dark theme can
 * be added later without rewriting component styles.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f2f5fa",
          100: "#e3e9f2",
          200: "#c6d2e4",
          300: "#9aafcd",
          400: "#6885ae",
          500: "#476694",
          600: "#33507a",
          700: "#2a4063",
          800: "#1b2a44",
          900: "#131e33",
          950: "#0b1220",
        },
        brand: {
          50: "#f3f1ff",
          100: "#e9e5ff",
          200: "#d5cdff",
          300: "#b7a6ff",
          400: "#9575ff",
          500: "#7c4dff",
          600: "#6d4aff",
          700: "#5b34e6",
          800: "#4a2bbd",
          900: "#3e2699",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f7f8fb",
          subtle: "#eef1f7",
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
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(11 18 32 / 0.04), 0 1px 3px 0 rgb(11 18 32 / 0.06)",
        raised: "0 8px 24px -12px rgb(11 18 32 / 0.24)",
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
