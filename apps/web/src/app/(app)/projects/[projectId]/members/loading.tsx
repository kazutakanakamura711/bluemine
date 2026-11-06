import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectMemberLoading() {
  return (
    <div role="status">
      <span className="sr-only">プロジェクトメンバーを読み込んでいます。</span>

      <div aria-hidden="true">
        {/* ヘッダーのスケルトン */}
        <header className="border-b border-border bg-background">
          <div className="flex min-h-23 items-center px-5 py-3 sm:px-6">
            <div className="w-full min-w-0 max-w-64">
              <Skeleton className="h-3 w-full max-w-40" />
              <Skeleton className="mt-2 h-5 w-full max-w-52" />
              <Skeleton className="mt-2 h-3 w-12" />
            </div>
          </div>
        </header>

        {/* タブのスケルトン */}
        <div className="flex h-11 items-center gap-4 border-b border-border bg-background px-5 sm:px-6">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>

        {/* メンバーリストのスケルトン */}
        <div className="p-4 sm:p-6">
          <div className="max-w-200 overflow-hidden rounded-lg border border-border bg-background">
            <div className="border-b border-border px-4 py-4 sm:px-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-8" />
            </div>

            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,4fr)_5rem_5rem] gap-4 border-b border-border bg-slate-50 px-4 py-3">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-12" />
              </div>

              <div className="divide-y divide-border">
                {Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,3fr)_minmax(0,4fr)_5rem_5rem] items-center gap-4 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="size-6 shrink-0 rounded-full" />
                      <Skeleton className="h-4 w-24 max-w-full" />
                    </div>
                    <Skeleton className="h-3 w-full max-w-44" />
                    <Skeleton className="h-5 w-16 rounded-sm" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border md:hidden">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="size-6 shrink-0 rounded-full" />
                      <Skeleton className="h-4 w-24 max-w-full" />
                    </div>
                    <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />
                  </div>
                  <div className="mt-1 pl-8">
                    <Skeleton className="h-3 w-full max-w-44" />
                    <Skeleton className="mt-2 h-3 w-28 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
