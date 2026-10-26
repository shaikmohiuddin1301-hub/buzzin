/**
 * Third-party learning media helpers.
 *
 * We never download, copy or rehost someone else's video. YouTube is embedded
 * through the privacy-enhanced domain; every other provider (Instagram, Vimeo,
 * a personal blog…) is presented as an attributed outbound link with a clear
 * "opens external content" label. This deliberately does not sync accounts:
 * that needs platform APIs, credentials and user permission, none of which are
 * configured in this build.
 */

export type ExternalProvider = "youtube" | "instagram" | "vimeo" | "other";

export function youtubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{6,20}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && /^[\w-]{6,20}$/.test(id) ? id : null;
      }
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,20})$/);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function externalProvider(value: string | null | undefined): ExternalProvider {
  if (!value) return "other";
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "vimeo.com" || host === "player.vimeo.com") return "vimeo";
    if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") return "youtube";
    return "other";
  } catch {
    return "other";
  }
}

/** Privacy-enhanced YouTube embed URL, or null when the link is not YouTube. */
export function youtubeEmbedUrl(value: string | null | undefined): string | null {
  const id = youtubeId(value);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

export function externalHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function providerLabel(provider: ExternalProvider): string {
  return provider === "youtube"
    ? "YouTube"
    : provider === "instagram"
      ? "Instagram"
      : provider === "vimeo"
        ? "Vimeo"
        : "External site";
}
