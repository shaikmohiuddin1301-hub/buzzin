import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end configuration.
 *
 * Deliberately separate from Vitest: `tests/` covers the service layer, `e2e/`
 * drives the real app in a browser. The server always starts against its own
 * seeded SQLite file on its own port, so running the suite never touches
 * `data/buildtogether.db` and never reuses a developer's running server.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const dataDir = path.join(__dirname, ".tmp-e2e");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One worker: the specs share one seeded database, and parallel sign-ins would
  // also collide with the auth rate limit.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  // The suite runs against `next dev`, so a cold route can spend a few seconds
  // compiling before the browser sees it. This only affects how long a real
  // assertion waits before failing; it does not weaken any assertion.
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(dataDir, "maya.json"),
        // A deterministic camera for the Take photo flow: Chromium supplies a fake
        // video device and auto-accepts the permission prompt. The component still
        // follows the real getUserMedia path, so a regression there fails the test.
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
        permissions: ["camera"],
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npx tsx e2e/prepare-db.ts && npx next dev -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_PATH: path.join(dataDir, "e2e.db"),
      STORAGE_LOCAL_DIR: path.join(dataDir, "storage"),
      // Next resolves `distDir` against the project root, so this must stay relative.
      NEXT_DIST_DIR: ".tmp-e2e/next",
      SESSION_SECRET: "e2e-secret-not-for-production",
      NEXT_PUBLIC_APP_URL: baseURL,
      EMAIL_PROVIDER: "console",
      AI_PROVIDER: "local",
      PAYMENTS_ENABLED: "false",
    },
  },
});
