import { Skeleton } from '@/components/ui/skeleton';

export function ProjectDetailLoadingHeader() {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="flex min-h-23 items-center px-5 py-3 sm:px-6">
          <div className="w-full min-w-0 max-w-64">
            <Skeleton className="h-3 w-full max-w-40" />
            <Skeleton className="mt-2 h-5 w-full max-w-52" />
            <Skeleton className="mt-2 h-3 w-12" />
          </div>
        </div>
      </header>
      <div className="flex h-11 items-center gap-4 border-b border-border bg-background px-5 sm:px-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-14" />
      </div>
    </>
  );
}
