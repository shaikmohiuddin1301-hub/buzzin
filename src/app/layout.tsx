import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BuildTogether — build real things, teach what you learn",
    template: "%s · BuildTogether",
  },
  description:
    "BuildTogether is where people discover real projects, collaborate on meaningful work, document the process, turn it into learning and build a credible reputation.",
  applicationName: "BuildTogether",
  openGraph: {
    title: "BuildTogether",
    description:
      "Discover real projects, contribute to work that matters, document the journey and teach what you learn.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F3" },
    { media: "(prefers-color-scheme: dark)", color: "#222226" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark/system choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface-muted">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:ink-surface focus:px-4 focus:py-2 focus:text-sm focus:text-surface"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
