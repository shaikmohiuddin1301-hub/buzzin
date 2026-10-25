import { NextResponse, type NextRequest } from "next/server";

/**
 * Adds the current path to request headers so the server-rendered shell can
 * mark the active navigation item without shipping a client-side router hook.
 * Authentication itself is enforced per page and per action, never here.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
