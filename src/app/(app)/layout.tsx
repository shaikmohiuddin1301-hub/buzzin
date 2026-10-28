import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // The pathname is read on the client (header, page surface, navigation state), not
  // here: a layout is not re-rendered for every navigation, so a server snapshot of
  // the URL is stale as soon as a link is followed.
  return <AppShell user={user}>{children}</AppShell>;
}
