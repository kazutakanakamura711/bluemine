// NestJS の GET /api/auth/me が返す、アプリ側の User の JSON。
export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

// セッションの token を NestJS に渡し、本人のユーザー情報を取得する。
export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUser> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  // ベース URL に /api が含まれるので、ここでは /auth/me を追加する。
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('ユーザー情報の取得に失敗しました。');
  }

  return response.json();
}
