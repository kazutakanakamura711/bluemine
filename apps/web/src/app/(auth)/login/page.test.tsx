import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LoginPage from './page';

vi.mock('./_components/login-form', () => ({
  LoginForm: () => <form aria-label="ログインフォーム" />,
}));

async function renderPage(searchParams: {
  confirmation?: string | string[];
  error?: string | string[];
}) {
  return render(
    <>{await LoginPage({ searchParams: Promise.resolve(searchParams) })}</>,
  );
}

describe('ログイン画面のメール確認結果', () => {
  it('確認成功時にログイン状態と次の操作を案内する', async () => {
    await renderPage({ confirmation: 'success' });

    expect(screen.getByRole('status')).toHaveTextContent(
      'メールアドレスの確認が完了しました。 ログイン中のアカウントは変更されていません。 確認したアカウントを利用する場合は、ログインしてください。',
    );
    expect(
      screen.getByRole('form', { name: 'ログインフォーム' }),
    ).toBeInTheDocument();
  });

  it('確認失敗時には成功の案内を表示しない', async () => {
    await renderPage({ error: 'confirmation_failed', confirmation: 'success' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'メールアドレスを確認できませんでした。',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    {},
    { confirmation: 'other' },
    { confirmation: ['success', 'success'] },
  ])(
    '成功を示す値がない場合は成功の案内を表示しない: %o',
    async (searchParams) => {
      await renderPage(searchParams);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );
});
