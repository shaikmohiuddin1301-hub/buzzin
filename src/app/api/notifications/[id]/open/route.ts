import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { safeNotificationHref } from "@/lib/notify";
import { getNotificationForUser, markRead } from "@/services/notifications";

export const dynamic = "force-dynamic";

/**
 * Open one notification as its owner.
 *
 * A notification's href is rendered as a link, but the redirect happens here so
 * that (a) read state changes only when the notification is actually opened, and
 * (b) the destination is re-validated against the stored, sanitised path. The
 * target page still enforces its own permissions: a revoked collaborator who
 * follows an old link lands on the app's not-found screen, not on private data.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  const notification = getNotificationForUser(user.id, id);
  if (!notification) {
    // Same response for "does not exist" and "belongs to someone else", so the
    // endpoint cannot be used to probe for other people's notification ids.
    const target = new URL("/notifications", request.url);
    target.searchParams.set("error", "That notification is not available.");
    return NextResponse.redirect(target);
  }

  markRead(user.id, notification.id);

  const href = safeNotificationHref(notification.href);
  if (!href) {
    const target = new URL("/notifications", request.url);
    target.searchParams.set("notice", "This notification no longer links anywhere.");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL(href, request.url));
}
