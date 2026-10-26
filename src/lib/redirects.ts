/**
 * Safe post-authentication redirects.
 *
 * `next` arrives from a query string or a hidden form field, so it is untrusted.
 * Only same-origin, application paths are allowed. Marketing, authentication and
 * the root entry screen are excluded so a signed-in visitor can never be bounced
 * back into a login screen (or into a redirect loop).
 */

const BASE = "https://buildtogether.invalid";

/** Paths that must never be a post-login destination. */
function isBlocked(pathname: string): boolean {
  if (pathname === "/" || pathname === "/welcome") return true;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/**
 * Return an internal path suitable for `redirect()`, or `fallback` when the value
 * is missing, external, protocol-relative, malformed or a redirect loop.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/home"): string {
  if (!value) return fallback;

  // Surrounding whitespace and raw control characters are never part of a real path.
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE || !url.pathname.startsWith("/")) return fallback;

  // Percent-encoded separators can be decoded by proxies into `//host` or `\`.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return fallback;
  }
  if (decodedPath.startsWith("//") || decodedPath.includes("\\")) return fallback;
  if (isBlocked(decodedPath)) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Build the sign-in URL that remembers where the visitor was heading. */
export function signInPath(requestedPath: string): string {
  const next = safeNextPath(requestedPath);
  return `/auth/sign-in?next=${encodeURIComponent(next)}`;
}

/** Add a validated `next` destination to a path without clobbering its query. */
export function withNext(path: string, next: string): string {
  const destination = safeNextPath(next);
  if (destination === "/home") return path;
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("next", destination);
  const search = params.toString();
  return search ? `${base}?${search}` : (base ?? "/");
}
