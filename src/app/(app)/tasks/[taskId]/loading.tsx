import { Skeleton } from "@/components/ui";

export default function TaskLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the Drop</span>
      <Skeleton className="h-3 w-64" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="card-surface space-y-3 p-5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          {[0, 1].map((key) => (
            <div key={key} className="card-surface space-y-2 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
