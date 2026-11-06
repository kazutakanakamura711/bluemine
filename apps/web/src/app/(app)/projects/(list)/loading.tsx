import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsLoading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-white p-6 text-slate-950">
      <h1 className="text-2xl font-semibold">プロジェクト一覧</h1>
      <p className="sr-only">プロジェクト一覧を読み込んでいます。</p>
      <Skeleton className="mt-2 h-5 w-32" />

      <ul className="mt-6 space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="rounded-lg border border-slate-200 p-4">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="mt-3 h-6 w-56" />
            <Skeleton className="mt-2 h-5 w-full max-w-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}
