import { Skeleton } from "@/components/ui";

export default function ChatsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading conversations</span>
      <Skeleton className="h-7 w-40" />
      <div className="mt-5 space-y-2">
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="card-surface flex items-center gap-3 p-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
