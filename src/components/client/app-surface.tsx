"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import { pageSurfaceClass } from "@/lib/navigation";

/**
 * The page background, chosen from the live pathname.
 *
 * A layout is not re-rendered for every navigation, so a background class taken
 * from the server pathname is wrong as soon as the reader follows a link (a chat
 * would keep the warm social page under it). Reading the URL on the client keeps the
 * surface and the page in step, and the mapping still lives in one place.
 */
export function AppSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className={cn("min-h-screen", pageSurfaceClass(pathname))}>{children}</div>;
}
