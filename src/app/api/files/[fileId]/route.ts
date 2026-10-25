import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessMedia, getMedia, readMedia, verifyMediaSignature } from "@/lib/storage";

/**
 * Private media delivery.
 *
 * Files are never served from a world-readable path. A request must either:
 *   1. carry a valid HMAC signature (short-lived, issued by `signedMediaUrl`), or
 *   2. come from a session whose authorisation passes `canAccessMedia`.
 *
 * Responses are marked `private` so intermediaries cannot cache confidential
 * content, and `nosniff` prevents content-type confusion attacks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature");
  const expires = url.searchParams.get("expires");

  const file = getMedia(fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signedOk = Boolean(signature && expires && verifyMediaSignature(fileId, expires, signature));

  if (!signedOk) {
    const viewer = await getCurrentUser();
    if (!canAccessMedia(file, viewer)) {
      // Same response for "does not exist" and "not yours" to avoid probing.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  let body: Buffer;
  try {
    body = await readMedia(file);
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 410 });
  }

  const download = url.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Length": String(body.byteLength),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.filename.replace(/"/g, "")}"`,
    "Cache-Control": signedOk ? "private, max-age=300" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });

  return new NextResponse(new Uint8Array(body), { status: 200, headers });
}
