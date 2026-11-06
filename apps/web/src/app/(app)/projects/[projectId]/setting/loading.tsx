import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectDetailLoadingHeader } from '../_components/project-detail-loading-header';

export default function ProjectSettingLoading() {
  return (
    <div role="status">
      <span className="sr-only">プロジェクト設定を読み込んでいます</span>

      <div aria-hidden="true">
        <ProjectDetailLoadingHeader />

        <div className="p-5 sm:p-6">
          <div className="px-5 py-6 sm:px-6">
            <Card className="max-w-150 rounded-lg">
              <CardHeader className="border-b border-border">
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent className="space-y-6 pt-5">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-3 w-full max-w-64" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-26 w-full" />
                </div>
                <Skeleton className="h-9 w-24" />
              </CardContent>
            </Card>
          </div>

          <div className="px-5 pb-6 sm:px-6">
            <Card className="max-w-150 rounded-lg">
              <CardHeader className="border-b border-border">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="pt-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-full max-w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full max-w-64" />
                  </div>
                  <Skeleton className="h-9 w-28 shrink-0" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
