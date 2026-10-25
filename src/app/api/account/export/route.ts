import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportUserData } from "@/services/users";

/** Machine-readable data export (UK GDPR right of access / portability). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });

  const data = exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="buildtogether-export-${user.username}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
