import { AuthSplit } from "@/components/auth-split";

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return <AuthSplit>{children}</AuthSplit>;
}
