import { SiteFooter, SiteHeader } from "@/components/marketing-chrome";
import { getCurrentUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col page-surface">
      <SiteHeader signedIn={!!user} username={user?.username} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
