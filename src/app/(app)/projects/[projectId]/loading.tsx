import { Skeleton } from "@/components/ui";

export default function ProjectLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the project</span>
      <div className="card-surface overflow-hidden">
        <Skeleton className="h-32 w-full rounded-none" />
        <div className="space-y-3 p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="card-surface space-y-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
