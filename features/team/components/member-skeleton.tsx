import { Skeleton } from "@/components/ui/skeleton";

export function MemberSkeleton() {
  return (
    <ul aria-busy className="divide-y overflow-hidden rounded-lg border bg-card">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}

