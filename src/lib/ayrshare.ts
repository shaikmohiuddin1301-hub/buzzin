/**
 * Ayrshare adapter — server only.
 *
 * Mirrors the endpoints of the `social-media-api` SDK
 * (https://github.com/ayrshare/social-media-api) over the plain REST API, so no third-party
 * package is vendored and the API key is never part of a client bundle. Only the calls this
 * product needs are wrapped:
 *
 *   POST   /post        publish to one or more networks
 *   DELETE /post        delete a published post by its Ayrshare id
 *   GET    /history     recent post statuses for the linked profile
 *   GET    /user        quota and which networks are actually linked
 *
 * Unconfigured means fail closed: `AYRSHARE_API_KEY` absent throws before any network call,
 * so a deployment without the integration cannot pretend to have posted.
 */
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const SOCIAL_PLATFORMS = [
  "twitter",
  "linkedin",
  "facebook",
  "instagram",
  "reddit",
  "telegram",
  "youtube",
  "gmb",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  reddit: "Reddit",
  telegram: "Telegram",
  youtube: "YouTube",
  gmb: "Google Business Profile",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform as SocialPlatform] ?? platform;
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export class SocialNotConfiguredError extends AppError {
  constructor() {
    super(
      "Social sharing is not configured on this deployment. Set AYRSHARE_API_KEY and link the accounts in the Ayrshare dashboard.",
      { status: 503, code: "social_unconfigured" },
    );
  }
}

type Json = Record<string, unknown>;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.ayrshareApiKey) throw new SocialNotConfiguredError();

  // A provider outage must not hold a server action open indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${env.ayrshareBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ayrshareApiKey}`,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok || payload.status === "error") {
      const detail = typeof payload.message === "string" ? payload.message : `provider returned ${response.status}`;
      throw new AppError(`Social publishing failed: ${detail}.`, { status: 502, code: "social_failed" });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new AppError("Social publishing timed out. Try again shortly.", { status: 504, code: "social_timeout" });
    }
    throw new AppError("Social publishing could not reach the provider.", { status: 502, code: "social_unreachable" });
  } finally {
    clearTimeout(timeout);
  }
}

export type PublishResult = {
  id: string;
  status: string;
  /** Per-network results as returned by the provider; kept for diagnostics only. */
  postIds?: unknown;
  errors?: unknown;
};

export async function publishSocialPost(input: {
  post: string;
  platforms: SocialPlatform[];
  mediaUrls?: string[];
  shortenLinks?: boolean;
}): Promise<PublishResult> {
  return request<PublishResult>("/post", {
    method: "POST",
    body: JSON.stringify({
      post: input.post,
      platforms: input.platforms,
      ...(input.mediaUrls?.length ? { mediaUrls: input.mediaUrls } : {}),
      ...(input.shortenLinks === false ? { shortenLinks: false } : {}),
    }),
  });
}

export async function deleteSocialPost(id: string): Promise<void> {
  await request<Json>("/post", { method: "DELETE", body: JSON.stringify({ id }) });
}

export async function socialHistory(limit = 10): Promise<unknown> {
  return request<unknown>(`/history?lastRecords=${encodeURIComponent(String(limit))}`);
}

export type SocialAccount = {
  status?: string;
  activeSocialAccounts?: string[];
  displayNames?: unknown[];
  quota?: { quota?: number; used?: number };
};

export async function socialAccount(): Promise<SocialAccount> {
  return request<SocialAccount>("/user");
}
