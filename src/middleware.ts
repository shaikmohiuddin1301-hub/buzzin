import { NextResponse, type NextRequest } from "next/server";

/**
 * Adds the current path and query to request headers so the server-rendered
 * shell can mark the active navigation item, and so a protected page can send a
 * signed-out visitor back to exactly where they were heading after sign-in.
 * Authentication itself is enforced per page and per action, never here.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  headers.set("x-search", request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
