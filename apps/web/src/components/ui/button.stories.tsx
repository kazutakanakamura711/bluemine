import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: {
    children: '保存',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
