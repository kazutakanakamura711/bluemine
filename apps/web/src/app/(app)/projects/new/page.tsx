import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { CreateProjectForm } from './_components/create-project-form';

export default function NewProjectPage() {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="flex min-h-17.5 items-center px-5 py-3 sm:px-6">
          <div>
            <Breadcrumb className="text-xs">
              <BreadcrumbList className="gap-1 text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink
                    render={<Link href="/projects" />}
                    className="hover:text-indigo-600"
                  >
                    プロジェクト一覧
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>新規プロジェクト</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              新規プロジェクト
            </h1>
          </div>
        </div>
      </header>

      <CreateProjectForm />
    </>
  );
}
