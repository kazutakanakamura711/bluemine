import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Label } from '@/components/ui/label';
import { TaskDateInput } from './task-date-input';

function DateFields({ disabled = false }: { disabled?: boolean }) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  return (
    <>
      <Label htmlFor="start-date">開始日</Label>
      <TaskDateInput
        id="start-date"
        name="startDate"
        label="開始日"
        value={startDate}
        onChange={setStartDate}
        disabled={disabled}
      />
      <Label htmlFor="due-date">期限</Label>
      <TaskDateInput
        id="due-date"
        name="dueDate"
        label="期限"
        value={dueDate}
        onChange={setDueDate}
        disabled={disabled}
      />
    </>
  );
}

describe('TaskDateInput', () => {
  beforeEach(() => {
    // タイマーは実時間のままにし、表示するカレンダーの年月だけを固定する。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 10, 12));
  });

  afterEach(() => vi.useRealTimers());

  it('日本語カレンダーで選択した年月日を表示し、クリアすると未設定へ戻る', async () => {
    const user = userEvent.setup();
    render(<DateFields />);
    const trigger = screen.getByRole('button', { name: '開始日' });
    expect(trigger).toHaveTextContent('年 /月 /日');
    await user.click(trigger);
    const calendar = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    expect(
      within(calendar).getByRole('button', { name: '開始日をクリア' }),
    ).toBeDisabled();
    await user.click(
      within(calendar).getByRole('button', { name: /2026年10月15日/ }),
    );
    expect(trigger).toHaveTextContent('2026/10/15');
    expect(document.querySelector('[name="startDate"]')).toHaveValue(
      '2026-10-15',
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(trigger);
    const reopened = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    await user.click(
      within(reopened).getByRole('button', { name: '次の月へ' }),
    );
    await user.click(
      within(reopened).getByRole('button', { name: /2026年11月20日/ }),
    );
    expect(trigger).toHaveTextContent('2026/11/20');
    expect(document.querySelector('[name="startDate"]')).toHaveValue(
      '2026-11-20',
    );

    await user.click(trigger);
    const selected = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    await user.click(
      within(selected).getByRole('button', { name: '開始日をクリア' }),
    );
    expect(trigger).toHaveTextContent('年 /月 /日');
    expect(document.querySelector('[name="startDate"]')).toHaveValue('');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('日付にフォーカスを移して矢印キーとEnterで選択でき、Escapeで値を変えずに閉じる', async () => {
    const user = userEvent.setup();
    render(<DateFields />);
    const trigger = screen.getByRole('button', { name: '開始日' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const calendar = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    await waitFor(() =>
      expect(
        within(calendar).getByRole('button', { name: /2026年10月10日/ }),
      ).toHaveFocus(),
    );
    await user.keyboard('{ArrowRight}{Enter}');
    expect(trigger).toHaveTextContent('2026/10/11');
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: '開始日を選択' });
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(document.querySelector('[name="startDate"]')).toHaveValue(
      '2026-10-11',
    );
    expect(trigger).toHaveFocus();
  });

  it('開始日を選択・クリアしても、期限の選択日を変えない', async () => {
    const user = userEvent.setup();
    render(<DateFields />);
    await user.click(screen.getByRole('button', { name: '期限' }));
    const dueCalendar = await screen.findByRole('dialog', {
      name: '期限を選択',
    });
    await user.click(
      within(dueCalendar).getByRole('button', { name: /2026年10月20日/ }),
    );
    await user.click(screen.getByRole('button', { name: '開始日' }));
    const startCalendar = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    await user.click(
      within(startCalendar).getByRole('button', { name: /2026年10月15日/ }),
    );
    await user.click(screen.getByRole('button', { name: '開始日' }));
    const selected = await screen.findByRole('dialog', {
      name: '開始日を選択',
    });
    await user.click(
      within(selected).getByRole('button', { name: '開始日をクリア' }),
    );
    expect(document.querySelector('[name="startDate"]')).toHaveValue('');
    expect(document.querySelector('[name="dueDate"]')).toHaveValue(
      '2026-10-20',
    );
    expect(screen.getByRole('button', { name: '期限' })).toHaveTextContent(
      '2026/10/20',
    );
  });

  it('無効時はカレンダーを開かず、日付も送信対象から外す', async () => {
    const user = userEvent.setup();
    render(<DateFields disabled />);
    const trigger = screen.getByRole('button', { name: '開始日' });
    expect(trigger).toBeDisabled();
    expect(screen.getByRole('button', { name: '期限' })).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[name="startDate"]')).toBeDisabled();
    expect(document.querySelector('[name="dueDate"]')).toBeDisabled();
  });
});
