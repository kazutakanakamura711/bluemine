import { redirect } from 'next/navigation';

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { projectId } = await params;
  // プロジェクトを開いたら、タスク一覧へ移動する。
  redirect(`/projects/${encodeURIComponent(projectId)}/tasks`);
}
