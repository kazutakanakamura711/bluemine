'use client';

import Link from 'next/link';
import { cn } from 'cn';

import { Button, buttonVariants } from '@/components/ui/button';

type ProjectMembersErrorProps = {
  retry: () => void;
};

export default function ProjectMembersError({
  retry,
}: ProjectMembersErrorProps) {
  return (
    <div className="p-4 sm:p-6">
      <section className="max-w-200 rounded-lg border border-border bg-background p-5 sm:p-6">
        <div role="alert">
          <h1 className="text-lg font-semibold tracking-tight">
            メンバー情報を取得できませんでした
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            時間をおいて、もう一度お試しください。
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
