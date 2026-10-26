import { Skeleton } from "@/components/ui";

export default function ProjectsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your projects</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="card-surface space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
