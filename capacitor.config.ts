import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell configuration.
 *
 * The product is a server-rendered Next.js application: pages are React Server Components and
 * every mutation is a server action bound to the SQLite database on the host. There is no JSON
 * API a native client could call, so the shell loads the deployed application in a WebView
 * instead of shipping a static bundle (which cannot exist for this app).
 *
 * `BUILDTOGETHER_APP_URL` overrides the default at build time, so a staging build can point at
 * a staging origin. Only https is allowed.
 */
const appUrl = process.env.BUILDTOGETHER_APP_URL?.trim() || "https://buildtogether-e6cb.onrender.com";

const config: CapacitorConfig = {
  appId: "com.buildtogether.app",
  appName: "BuildTogether",
  webDir: "www",
  server: {
    url: appUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    // The app is server-rendered; keeping the WebView within the app avoids opening Safari.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
