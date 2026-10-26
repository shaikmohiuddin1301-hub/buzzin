import { Skeleton } from "@/components/ui";

export default function LessonLoading() {
  return (
    <div aria-busy="true" aria-label="Loading lesson">
      <Skeleton className="mb-4 h-3 w-64" />
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
