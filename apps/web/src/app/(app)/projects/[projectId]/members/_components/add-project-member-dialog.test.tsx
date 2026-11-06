import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addProjectMember } from '../_lib/add-project-member';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import type { ProjectMember } from '../_lib/get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { AddProjectMemberDialog } from './add-project-member-dialog';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock('../_lib/add-project-member', () => ({
  addProjectMember: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}));

const addedMember: ProjectMember = {
  id: 'membership-new',
  userId: 'user-new',
  role: ProjectRole.Member,
  createdAt: '2026-10-19T00:00:00.000Z',
  user: { name: null, email: 'Member@example.test' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addProjectMember).mockReset().mockResolvedValue(addedMember);
});

async function openDialog() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'メンバーを追加' });
  await user.click(trigger);
  await waitFor(() => {
    expect(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
    ).toHaveFocus();
  });
  return { user, trigger };
}

describe('AddProjectMemberDialog の表示と開閉', () => {
  it('メールと権限の入力欄を表示し、メンバーを初期選択にする', async () => {
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    await openDialog();

    const dialog = screen.getByRole('dialog', { name: 'メンバーを追加' });
    expect(
      within(dialog).getByRole('textbox', { name: 'メールアドレス' }),
    ).toBeRequired();
    const role = within(dialog).getByRole('combobox', { name: '権限' });
    expect(role).toBeRequired();
    expect(role).toHaveValue(ProjectRole.Member);
    expect(
      within(role)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['メンバー', '閲覧者']);
    expect(dialog).toHaveAccessibleDescription(
      '追加する相手は、メール確認後に一度このアプリへログインしてください。',
    );
  });

  it.each(['キャンセル', '閉じる'])(
    '未入力のまま%sを押しても、閉じる前に必須エラーを表示しない',
    async (method) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user, trigger } = await openDialog();
      const email = screen.getByRole('textbox', { name: 'メールアドレス' });
      const closeButton = screen.getByRole('button', { name: method });

      // pointerdown と click の間も確認し、一瞬だけ出るエラーを検出する。
      await user.pointer({ target: closeButton, keys: '[MouseLeft>]' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(email).toHaveAttribute('aria-invalid', 'false');
      await user.pointer({ target: closeButton, keys: '[/MouseLeft]' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
      });
      expect(addProjectMember).not.toHaveBeenCalled();

      await user.click(trigger);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
      ).toHaveValue('');
    },
  );

  it.each(['Escape キー', '背景クリック'])(
    '未入力のまま%sで閉じても、必須エラーを表示しない',
    async (method) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user, trigger } = await openDialog();

      const addedAlerts: string[] = [];
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              if (node.matches('[role="alert"]')) {
                addedAlerts.push(node.textContent ?? '');
              }
              for (const alert of node.querySelectorAll('[role="alert"]')) {
                addedAlerts.push(alert.textContent ?? '');
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      try {
        if (method === 'Escape キー') {
          await user.keyboard('{Escape}');
        } else {
          const overlay = document.querySelector(
            '[data-slot="dialog-overlay"]',
          )!;
          await user.pointer({ target: overlay, keys: '[MouseLeft>]' });
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
          await user.pointer({ target: overlay, keys: '[/MouseLeft]' });
        }
        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          if (method === 'Escape キー') {
            expect(trigger).toHaveFocus();
          }
        });
        expect(addedAlerts).toEqual([]);
      } finally {
        observer.disconnect();
      }

      expect(addProjectMember).not.toHaveBeenCalled();
      await user.click(trigger);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('未入力のまま追加を押すと必須エラーを表示し、送信しない', async () => {
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'メールアドレスは必須です',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(addProjectMember).not.toHaveBeenCalled();
  });

  it.each([
    { value: '', message: 'メールアドレスは必須です' },
    { value: '　　', message: 'メールアドレスは必須です' },
    {
      value: 'invalid-email',
      message: 'メールアドレスの形式が正しくありません',
    },
  ])(
    'メールが「$value」の場合、blur では検証せず、送信時に「$message」を表示する',
    async ({ value, message }) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user } = await openDialog();
      const email = screen.getByRole('textbox', { name: 'メールアドレス' });

      if (value) {
        await user.type(email, value);
      }
      await user.tab();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(email).toHaveAttribute('aria-invalid', 'false');
      expect(addProjectMember).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: '追加' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(email).toHaveAccessibleDescription(
        expect.stringContaining(message),
      );
      expect(addProjectMember).not.toHaveBeenCalled();
    },
  );

  it.each(['Member@example.test', '　Member@example.test　'])(
    'メール「%s」は送信時に前後空白を除いて検証し、大文字・小文字を保持する',
    async (value) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user } = await openDialog();
      const email = screen.getByRole('textbox', { name: 'メールアドレス' });

      await user.type(email, value);
      await user.tab();

      await waitFor(() => {
        expect(email).toHaveAttribute('aria-invalid', 'false');
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(email).toHaveValue(value);

      await user.click(screen.getByRole('button', { name: '追加' }));
      await waitFor(() => {
        expect(addProjectMember).toHaveBeenCalledExactlyOnceWith('project-id', {
          email: 'Member@example.test',
          role: ProjectRole.Member,
        });
      });
    },
  );

  it('送信時のメールエラーは、正しい値に入力し直すと再送信なしで解消する', async () => {
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    const email = screen.getByRole('textbox', { name: 'メールアドレス' });
    await user.type(email, 'invalid-email');
    await user.click(screen.getByRole('button', { name: '追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'メールアドレスの形式が正しくありません',
    );

    await user.clear(email);
    await user.type(email, 'Member@example.test');

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  it.each([ProjectRole.Owner, 'manager'])(
    '選択肢が改変されても、%sを権限の入力検証で拒否する',
    async (invalidRole) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user } = await openDialog();
      await user.type(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
        'member@example.test',
      );
      const role = screen.getByRole('combobox', { name: '権限' });
      role.append(new Option('不正な権限', invalidRole));

      await user.selectOptions(role, invalidRole);
      await user.tab();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(role).toHaveAttribute('aria-invalid', 'false');
      await user.click(screen.getByRole('button', { name: '追加' }));

      const message = '権限はメンバーまたは閲覧者を選択してください';
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(role).toHaveAttribute('aria-invalid', 'true');
      expect(role).toHaveAccessibleDescription(message);
      expect(addProjectMember).not.toHaveBeenCalled();

      await user.selectOptions(role, ProjectRole.Viewer);
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
      expect(role).toHaveAttribute('aria-invalid', 'false');
    },
  );

  it.each(['キャンセル', '閉じるボタン', 'Escape キー'])(
    '入力エラーの後に%sで閉じると、入力値とエラーを初期化する',
    async (method) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user, trigger } = await openDialog();
      await user.type(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
        'invalid-email',
      );
      await user.selectOptions(
        screen.getByRole('combobox', { name: '権限' }),
        ProjectRole.Viewer,
      );
      await user.click(screen.getByRole('button', { name: '追加' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      if (method === 'Escape キー') {
        await user.keyboard('{Escape}');
      } else {
        await user.click(
          screen.getByRole('button', {
            name: method === 'キャンセル' ? 'キャンセル' : '閉じる',
          }),
        );
      }
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      await user.click(trigger);

      expect(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
      ).toHaveValue('');
      expect(screen.getByRole('combobox', { name: '権限' })).toHaveValue(
        ProjectRole.Member,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
      ).toHaveAttribute('aria-invalid', 'false');

      // 再度開いたフォームも、初回の送信までは検証しない。
      await user.type(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
        'invalid-email',
      );
      await user.tab();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('キャンセルすると閉じて入口へフォーカスを戻し、再度開くと入力を初期化する', async () => {
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user, trigger } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
      'member@example.test',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '権限' }),
      ProjectRole.Viewer,
    );

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    await user.click(trigger);
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toHaveValue(
      '',
    );
    expect(screen.getByRole('combobox', { name: '権限' })).toHaveValue(
      ProjectRole.Member,
    );
  });

  it.each(['閉じるボタン', 'Escape キー'])(
    '%s で閉じ、入口へフォーカスを戻す',
    async (method) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user, trigger } = await openDialog();

      if (method === '閉じるボタン') {
        await user.click(screen.getByRole('button', { name: '閉じる' }));
      } else {
        await user.keyboard('{Escape}');
      }

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
      });
    },
  );

  it('アーカイブ済みでは入口を無効にし、理由を表示する', async () => {
    render(<AddProjectMemberDialog projectId="project-id" isArchived />);
    const trigger = screen.getByRole('button', { name: 'メンバーを追加' });

    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription(
      'アーカイブ済みのため、メンバーを追加できません。',
    );
    await userEvent.setup().click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AddProjectMemberDialog の送信', () => {
  it.each([ProjectRole.Member, ProjectRole.Viewer])(
    '%s と trim 済みのメールを渡し、成功通知・閉じる・一覧更新を行う',
    async (role) => {
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user, trigger } = await openDialog();
      await user.type(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
        '　Member@example.test　',
      );
      await user.selectOptions(
        screen.getByRole('combobox', { name: '権限' }),
        role,
      );
      await user.click(screen.getByRole('button', { name: '追加' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(addProjectMember).toHaveBeenCalledExactlyOnceWith('project-id', {
        email: 'Member@example.test',
        role,
      });
      expect(mocks.toastAdd).toHaveBeenCalledExactlyOnceWith({
        type: 'success',
        title: 'メンバーを追加しました',
      });
      expect(mocks.refresh).toHaveBeenCalledTimes(1);

      await user.click(trigger);
      expect(
        screen.getByRole('textbox', { name: 'メールアドレス' }),
      ).toHaveValue('');
      expect(screen.getByRole('combobox', { name: '権限' })).toHaveValue(
        ProjectRole.Member,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('メール入力欄の Enter キーでも送信できる', async () => {
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
      'Member@example.test{Enter}',
    );

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(addProjectMember).toHaveBeenCalledExactlyOnceWith('project-id', {
      email: 'Member@example.test',
      role: ProjectRole.Member,
    });
  });

  it.each(['追加ボタン', 'Enter キー'])(
    '%sで送信中は入力・閉じる操作を無効にし、通常操作で再送しない',
    async (method) => {
      let resolveRequest!: (member: ProjectMember) => void;
      vi.mocked(addProjectMember).mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
      );
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user } = await openDialog();
      const email = screen.getByRole('textbox', { name: 'メールアドレス' });
      const role = screen.getByRole('combobox', { name: '権限' });
      await user.type(email, 'Member@example.test');
      await user.selectOptions(role, ProjectRole.Viewer);
      if (method === 'Enter キー') {
        await user.click(email);
        await user.keyboard('{Enter}');
      } else {
        await user.click(screen.getByRole('button', { name: '追加' }));
      }
      await waitFor(() => expect(addProjectMember).toHaveBeenCalledTimes(1));

      expect(email).toBeDisabled();
      expect(role).toBeDisabled();
      expect(screen.getByRole('button', { name: '追加中...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
      const form = screen.getByRole('dialog').querySelector('form')!;
      expect(form).toHaveAttribute('aria-busy', 'true');

      await user.click(screen.getByRole('button', { name: '追加中...' }));
      await user.keyboard('{Enter}');
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      await user.click(screen.getByRole('button', { name: '閉じる' }));
      await user.keyboard('{Escape}');
      const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
      await user.click(overlay);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(addProjectMember).toHaveBeenCalledTimes(1);
      expect(mocks.refresh).not.toHaveBeenCalled();

      await act(async () => resolveRequest(addedMember));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      expect(mocks.toastAdd).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [400, '入力内容を確認してください'],
    [401, 'Unauthorized'],
    [403, 'プロジェクトに参加者を追加する権限がありません'],
    [404, 'プロジェクトが見つかりません'],
    [404, '追加対象のユーザーが見つかりません'],
    [409, 'アーカイブ済みのプロジェクトにメンバーを追加できません'],
    [409, '指定したユーザーはすでに参加しています'],
  ])(
    'API が %s「%s」を返すと、入力を保持してメッセージを表示する',
    async (status, message) => {
      vi.mocked(addProjectMember).mockRejectedValue(
        new ProjectRequestError(message, status),
      );
      render(
        <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
      );
      const { user } = await openDialog();
      const email = screen.getByRole('textbox', { name: 'メールアドレス' });
      const role = screen.getByRole('combobox', { name: '権限' });
      await user.type(email, 'Member@example.test');
      await user.selectOptions(role, ProjectRole.Viewer);
      await user.click(screen.getByRole('button', { name: '追加' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(email).toHaveValue('Member@example.test');
      expect(role).toHaveValue(ProjectRole.Viewer);
      expect(email).toBeEnabled();
      expect(role).toBeEnabled();
      expect(screen.getByRole('button', { name: '追加' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeEnabled();
      expect(mocks.toastAdd).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TypeError('Failed to fetch'),
    new Error('internal detail'),
    'unknown failure',
  ])('予期しないエラー %s では、通信エラーの案内を表示する', async (error) => {
    vi.mocked(addProjectMember).mockRejectedValue(error);
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
      'Member@example.test',
    );
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
    );
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toHaveValue(
      'Member@example.test',
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toastAdd).not.toHaveBeenCalled();
  });

  it('失敗後は修正して再送信でき、前回のエラーを解消する', async () => {
    vi.mocked(addProjectMember)
      .mockRejectedValueOnce(
        new ProjectRequestError('指定したユーザーはすでに参加しています', 409),
      )
      .mockResolvedValueOnce(addedMember);
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    const email = screen.getByRole('textbox', { name: 'メールアドレス' });
    await user.type(email, 'existing@example.test');
    await user.click(screen.getByRole('button', { name: '追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '指定したユーザーはすでに参加しています',
    );

    await user.clear(email);
    await user.type(email, 'Member@example.test');
    await user.click(screen.getByRole('button', { name: '追加' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(addProjectMember).toHaveBeenCalledTimes(2);
    expect(addProjectMember).toHaveBeenLastCalledWith('project-id', {
      email: 'Member@example.test',
      role: ProjectRole.Member,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.toastAdd).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'メンバーを追加' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('API エラーの後にキャンセルして再度開くと、入力とエラーを初期化する', async () => {
    vi.mocked(addProjectMember).mockRejectedValue(
      new ProjectRequestError('追加対象のユーザーが見つかりません', 404),
    );
    render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user, trigger } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
      'missing@example.test',
    );
    await user.click(screen.getByRole('button', { name: '追加' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(trigger);

    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toHaveValue(
      '',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('開いた後にアーカイブ状態へ変わると、入力と追加操作を無効にする', async () => {
    const { rerender } = render(
      <AddProjectMemberDialog projectId="project-id" isArchived={false} />,
    );
    const { user } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
      'Member@example.test',
    );
    rerender(<AddProjectMemberDialog projectId="project-id" isArchived />);

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'メールアドレス' }),
    ).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '権限' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '追加' }));
    await user.keyboard('{Enter}');
    expect(addProjectMember).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toastAdd).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
