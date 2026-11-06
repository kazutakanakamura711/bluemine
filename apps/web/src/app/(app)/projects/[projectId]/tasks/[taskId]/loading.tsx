import { Skeleton } from '@/components/ui/skeleton';

export default function TaskDetailLoading() {
  return (
    <div role="status">
      <span className="sr-only">タスク詳細を読み込んでいます</span>

      <div aria-hidden="true">
        <header className="flex min-h-18 min-w-0 flex-col justify-center gap-1 border-b border-border bg-background px-4 py-3 sm:px-6">
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-6 w-24" />
        </header>

        <div className="grid min-w-0 grid-cols-1 items-start gap-6 p-4 sm:p-6 lg:grid-cols-3">
          {/* 本文カードは、タイトルと説明の配置に合わせる。 */}
          <div className="min-w-0 rounded-sm border border-border bg-background p-5 lg:col-span-2">
            <Skeleton className="h-7 w-52 max-w-full" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>

          {/* 属性カードは、状態・優先度、日付、日時の3グループに分ける。 */}
          <div className="min-w-0 rounded-sm border border-border bg-background p-5">
            <Skeleton className="h-4 w-8" />

            {[
              ['w-16', 'w-full'],
              ['w-28', 'w-28'],
              ['w-36', 'w-36'],
            ].map((valueWidths, groupIndex) => (
              <div
                key={groupIndex}
                className={`mt-4 space-y-4 ${groupIndex > 0 ? 'border-t border-border pt-4' : ''}`}
              >
                {valueWidths.map((valueWidth, index) => (
                  <div key={index}>
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className={`mt-1 h-5 max-w-full ${valueWidth}`} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
