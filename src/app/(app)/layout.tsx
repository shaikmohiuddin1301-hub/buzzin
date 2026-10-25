import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pathname = (await headers()).get("x-pathname") ?? "/home";

  return (
    <AppShell user={user} activePath={pathname}>
      {children}
    </AppShell>
  );
}
