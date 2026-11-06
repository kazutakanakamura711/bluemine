import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  args: {
    className: 'w-[min(36rem,calc(100vw-2rem))]',
    variant: 'default',
  },
  argTypes: {
    children: { control: false, table: { disable: true } },
    className: { control: false, table: { disable: true } },
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <AlertTitle>Projectを保存しました</AlertTitle>
        <AlertDescription>設定内容を更新しました。</AlertDescription>
      </>
    ),
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: (
      <>
        <AlertTitle>保存できませんでした</AlertTitle>
        <AlertDescription>
          入力内容を確認して、もう一度お試しください。
        </AlertDescription>
      </>
    ),
  },
};

export const WithAction: Story = {
  args: {
    children: (
      <>
        <AlertTitle>接続を確認できません</AlertTitle>
        <AlertDescription>
          ネットワークを確認してから、再試行してください。
        </AlertDescription>
        <AlertAction>
          <Button type="button" size="sm" variant="outline">
            再試行
          </Button>
        </AlertAction>
      </>
    ),
  },
};
