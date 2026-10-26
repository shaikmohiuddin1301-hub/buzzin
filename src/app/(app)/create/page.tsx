import Link from "next/link";
import { BookOpen, FolderKanban, GraduationCap, ImagePlus, Megaphone, Plus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Create" };

const OPTIONS = [
  {
    href: "/projects/new",
    icon: FolderKanban,
    title: "New project",
    description: "Define what you want to build and invite people to build it with you.",
  },
  {
    href: "/create/post",
    icon: ImagePlus,
    title: "New post",
    description: "Share a photo, a piece of work or a short update on your profile.",
  },
  {
    href: "/create/update",
    icon: Megaphone,
    title: "Share an update",
    description: "Post progress, a milestone or an announcement, on its own or with a project.",
  },
  {
    href: "/create/teaching",
    icon: GraduationCap,
    title: "New teaching",
    description: "Publish a tutorial, guide or explainer so others can learn from your work.",
  },
  {
    href: "/create/learning",
    icon: BookOpen,
    title: "Share a learning",
    description: "Record what you learned, or a reflection on something you finished.",
  },
  {
    href: "/create/drop",
    icon: Plus,
    title: "New Drop",
    description: "Add trackable work inside a project you own or help run.",
  },
];

export default async function CreatePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Create"
        title="What are you making?"
        description="Everything you publish starts here and lands on your profile, in the feed, and in the projects it belongs to."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.href}>
              <Link href={option.href} className="block h-full">
                <Card className="motion-card h-full p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h2 className="mt-3 text-[14px] font-semibold text-navy-950">{option.title}</h2>
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
