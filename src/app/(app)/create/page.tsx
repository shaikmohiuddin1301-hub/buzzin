import Link from "next/link";
import { BookOpen, FolderKanban, GraduationCap, ImagePlus, Megaphone, Plus, Presentation } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { orderByAccountPriority } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { accountContext } from "@/services/account";

export const metadata = { title: "Create" };

const OPTIONS = [
  {
    href: "/projects/new",
    icon: FolderKanban,
    label: "New project",
    description: "Define what you want to build and invite people to build it with you.",
  },
  {
    href: "/create/post",
    icon: ImagePlus,
    label: "New post",
    description: "Share a photo, a piece of work or a short update on your profile.",
  },
  {
    href: "/create/update",
    icon: Megaphone,
    label: "Share an update",
    description: "Post progress, a milestone or an announcement, on its own or with a project.",
  },
  {
    href: "/create/teaching",
    icon: GraduationCap,
    label: "New teaching",
    description: "Publish a tutorial, guide or explainer so others can learn from your work.",
  },
  {
    href: "/studio/courses/new",
    icon: Presentation,
    label: "New course",
    description: "Build an ordered course from your own lessons, credited external videos and project practice.",
  },
  {
    href: "/create/learning",
    icon: BookOpen,
    label: "Share a learning",
    description: "Record what you learned, or a reflection on something you finished.",
  },
  {
    href: "/create/task",
    icon: Plus,
    label: "New task",
    description: "One specific piece of work, with a home, an owner and a review.",
  },
];

export default async function CreatePage() {
  const user = await requireUser();
  const account = accountContext(user);
  const options = orderByAccountPriority(OPTIONS, account.kind);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Create"
        title="What are you making?"
        description="Everything you publish starts here and lands on your profile, in the feed, and in the projects it belongs to."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.href}>
              <Link href={option.href} className="block h-full">
                <Card className="motion-card h-full p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h2 className="mt-3 text-[14px] font-semibold text-navy-950">{option.label}</h2>
                  <p className="mt-1 text-[12.5px] leading-6 text-navy-600">{option.description}</p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
