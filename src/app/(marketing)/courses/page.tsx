import { BookOpen, GraduationCap } from "lucide-react";
import { ResourceCard } from "@/components/cards";
import { ButtonLink, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { listResources } from "@/services/learning";

export const metadata = {
  title: "Courses",
  description: "Browse free, structured courses created by practical makers and educators.",
};

export const dynamic = "force-dynamic";

export default async function PublicCoursesPage() {
  const courses = listResources({ format: "course", limit: 30 });
  const creatorCount = new Set(courses.map((course) => course.creatorUsername)).size;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        eyebrow="Learning"
        title="Structured courses from people who do the work"
        description="Follow a sequence of lessons, use credited external videos and resources, then practise in a real project. Courses are free to preview and free to enrol in this build."
        actions={
          <>
            <ButtonLink href="/auth/sign-in" variant="secondary" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/learn" size="sm">
              Learning centre
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Courses" value={courses.length} hint="Published public courses" />
        <Stat label="Creators" value={creatorCount} hint="Practical educators" />
        <Stat label="Payments" value="Off" hint="No charges are made in this build" />
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={24} aria-hidden="true" />}
          title="No public courses yet"
          description="Creators can build a course from their tutorials, credited YouTube videos, downloadable resources and project practice. Published public courses appear here."
          action={<ButtonLink href="/auth/sign-up" size="sm">Create an account to publish</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3">
          {courses.map((course) => (
            <ResourceCard key={course.id} resource={course} href={`/courses/${course.id}`} />
          ))}
        </div>
      )}

      <Card className="mt-8 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
          <BookOpen size={15} aria-hidden="true" /> Honest about where content lives
        </h2>
        <p className="mt-1 text-[12px] leading-6 text-navy-600">
          Some lessons embed or link to videos hosted on YouTube or Instagram. Those items remain the property of their
          creators, are never downloaded or rehosted here, and open on the original platform where embedding is not allowed.
          Course completion is a learning record, not a certificate or an accepted project contribution.
        </p>
      </Card>
    </div>
  );
}
