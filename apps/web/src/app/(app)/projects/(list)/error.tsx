'use client';

import { Button } from '@/components/ui/button';

export default function ProjectsError({ retry }: { retry: () => void }) {
  return (
    <div className="min-h-screen bg-white p-6 text-slate-950">
      <h1 className="text-2xl font-semibold">
        プロジェクト一覧を取得できませんでした
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        時間をおいて、もう一度お試しください。
      </p>
      {/* retry() は詳細ページを再取得して、エラー境界からの復旧を試みる。 */}
      <Button className="mt-4" onClick={() => retry()}>
        再試行
      </Button>
    </div>
  );
}
