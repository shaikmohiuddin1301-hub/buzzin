import { Card, Skeleton } from "@/components/ui";

export default function NotificationsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="mb-6 h-9 w-48 rounded-full" />
      <Card>
        <div className="divide-y divide-navy-100">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 px-5 py-4">
              <Skeleton className="h-[30px] w-[30px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <span className="sr-only">Loading notifications</span>
    </div>
  );
}
