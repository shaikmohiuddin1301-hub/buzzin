import { Card, Skeleton } from "@/components/ui";

export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your home feed</span>
      <div className="mb-6 space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <Skeleton className="mb-4 h-10 w-full rounded-xl" />
          <Card className="mb-4 p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-8 w-40" />
              </div>
            </div>
          </Card>
          {[0, 1, 2].map((key) => (
            <Card key={key} className="mb-3 space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {[0, 1].map((key) => (
            <Card key={key} className="space-y-3 p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
