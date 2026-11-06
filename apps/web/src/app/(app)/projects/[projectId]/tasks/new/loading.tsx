import { Skeleton } from '@/components/ui/skeleton';

export default function NewTaskLoading() {
  return (
    <div role="status">
      <span className="sr-only">タスク作成画面を読み込んでいます</span>
      <div aria-hidden="true">
        <header className="min-h-20 space-y-2 border-b border-border bg-background px-4 py-3 sm:px-6">
          <Skeleton className="h-3 w-72 max-w-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-28" />
        </header>
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 rounded-sm border border-border bg-background p-5 lg:col-span-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full md:h-8" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-60 w-full md:h-40" />
          </div>
          <div className="min-w-0 space-y-4">
            {[4, 3].map((fieldCount) => (
              <div
                key={fieldCount}
                className="space-y-4 rounded-sm border border-border bg-background p-5"
              >
                <Skeleton className="h-3 w-16" />
                {Array.from({ length: fieldCount }, (_, index) => (
                  <div key={index} className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-9 w-full md:h-8" />
                  </div>
                ))}
              </div>
            ))}
            <Skeleton className="h-9 w-full md:h-8" />
            <Skeleton className="h-9 w-full md:h-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
