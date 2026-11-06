import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from '@/components/ui/badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: {
    children: 'バッジ',
    variant: 'default',
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
  },
};

export const LongText: Story = {
  args: {
    children: '長いラベルが表示領域を超えたときのバッジの表示を確認します',
    className: 'max-w-[calc(100vw-2rem)] justify-start',
  },
};
