import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getProjects(): Promise<Project[]> {
  // プロジェクト一覧は API の最新データを表示するため、ビルド時ではなくリクエスト時に取得する。
  await connection();

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  // Cookie を扱えるサーバー用クライアントを作る。
  const supabase = await createClient();
  // 作ったクライアントを使い、Cookie に保存されたセッションを取得する。
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const accessToken = data.session.access_token;

  const response = await fetch(`${apiBaseUrl}/projects`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('プロジェクト一覧の取得に失敗しました。');
  }

  return response.json();
}
