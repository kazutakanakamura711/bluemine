import { Skeleton } from '@/components/ui/skeleton';
import { ProjectDetailLoadingHeader } from '../_components/project-detail-loading-header';

export default function ProjectTasksLoading() {
  return (
    <div role="status">
      <span className="sr-only">タスク一覧を読み込んでいます</span>

      <div aria-hidden="true">
        <ProjectDetailLoadingHeader />

        {/* PCは行、モバイルはカードの形で表示する。 */}
        <div className="flex min-h-12 items-center justify-end border-b border-border bg-background px-3 py-2 sm:px-6">
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="hidden overflow-x-auto md:block">
          <div className="grid h-10 min-w-4xl grid-cols-[6rem_minmax(0,1fr)_7rem_4rem_7rem_7rem_7rem_6rem] items-center border-b border-border bg-slate-50 px-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-12" />
            ))}
          </div>
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="grid min-w-4xl grid-cols-[6rem_minmax(0,1fr)_7rem_4rem_7rem_7rem_7rem_6rem] items-center border-b border-border bg-background px-3 py-4"
            >
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-full max-w-44" />
              <Skeleton className="h-5 w-16 rounded-sm" />
              <Skeleton className="h-5 w-8 rounded-sm" />
              {Array.from({ length: 4 }, (_, column) => (
                <Skeleton key={column} className="h-3 w-16" />
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-2 p-3 md:hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="rounded-sm border border-border bg-background p-3 shadow-sm"
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-full max-w-52" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="h-5 w-8 rounded-sm" />
                <Skeleton className="ml-auto h-3 w-20" />
              </div>
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
