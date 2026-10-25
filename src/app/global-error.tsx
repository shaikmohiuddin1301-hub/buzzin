"use client";

/**
 * Root error boundary.
 *
 * Only used when the root layout itself throws — the `error.tsx` boundary cannot catch that
 * because it renders inside the layout. It must supply its own <html> and <body>, and it
 * deliberately avoids the database, the session and any component that could fail again.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f8fb", margin: 0 }}>
        <main style={{ margin: "0 auto", maxWidth: "32rem", padding: "6rem 1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", color: "#0b1220" }}>BuildTogether is unavailable</h1>
          <p style={{ color: "#2a4063", lineHeight: 1.6 }}>
            The application could not start. If you operate this deployment, check{" "}
            <a href="/api/health" style={{ color: "#5b34e6" }}>
              /api/health
            </a>{" "}
            and the server logs.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#6d4aff",
              color: "white",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
