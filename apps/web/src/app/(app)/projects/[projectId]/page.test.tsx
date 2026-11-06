import { describe, expect, it, vi } from 'vitest';

import ProjectDetailPage from './page';

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));

describe('ProjectDetailPage', () => {
  it('プロジェクトの入口からタスク一覧URLへ転送する', async () => {
    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ projectId: 'project-id' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/projects/project-id/tasks');
  });

  it('転送先のprojectIdをパス要素としてエンコードする', async () => {
    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ projectId: 'project/id?draft#1' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/projects/project%2Fid%3Fdraft%231/tasks');
  });
});
