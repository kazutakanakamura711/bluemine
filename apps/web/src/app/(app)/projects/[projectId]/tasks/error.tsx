'use client';

import Link from 'next/link';
import { cn } from 'cn';

import { Button, buttonVariants } from '@/components/ui/button';

type ProjectTasksErrorProps = {
  retry: () => void;
};

export default function ProjectTasksError({ retry }: ProjectTasksErrorProps) {
  return (
    <div className="p-4 sm:p-6">
      <section className="rounded-lg border border-border bg-background p-5 sm:p-6">
        <div role="alert">
          <h1 className="text-lg font-semibold tracking-tight">
            タスク一覧を取得できませんでした
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            時間をおいて、もう一度お試しください。
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {/* retry() は、このルートのデータを再取得して復旧を試みる。 */}
          <Button type="button" onClick={() => retry()}>
            再試行
          </Button>
          <Link
            href="/projects"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            プロジェクト一覧に戻る
          </Link>
        </div>
      </section>
    </div>
  );
}
