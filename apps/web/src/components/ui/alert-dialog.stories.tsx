import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type AlertDialogPreviewProps = {
  description: string;
  actionDisabled: boolean;
};

function AlertDialogPreview({
  description,
  actionDisabled,
}: AlertDialogPreviewProps) {
  const [open, setOpen] = useState(true);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" />}>
        プロジェクトをアーカイブ
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[min(24rem,calc(100vw-2rem))]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            プロジェクトをアーカイブしますか？
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">キャンセル</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={actionDisabled}
            onClick={() => setOpen(false)}
          >
            アーカイブ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const meta = {
  title: 'UI/AlertDialog',
  component: AlertDialogPreview,
  args: {
    description:
      'アーカイブすると、このプロジェクトのタスク作成・更新ができなくなります。既存のデータは保持されます。',
    actionDisabled: false,
  },
  argTypes: {
    description: { control: 'text' },
    actionDisabled: { control: 'boolean' },
  },
} satisfies Meta<typeof AlertDialogPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongDescription: Story = {
  args: {
    description:
      'このプロジェクトをアーカイブすると、メンバーは通常の一覧からプロジェクトを選択できなくなり、タスクの作成や更新もできなくなります。既存のタスクやメンバー情報は削除されず、アーカイブ解除後に再び利用できます。アーカイブ中もプロジェクトの詳細や既存データは閲覧できます。必要な場合は設定からいつでも解除できます。',
  },
};

export const ConfirmActionDisabled: Story = {
  args: {
    actionDisabled: true,
  },
};
