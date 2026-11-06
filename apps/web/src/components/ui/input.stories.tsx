import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const meta = {
  title: 'UI/Input',
  component: Input,
  args: {
    id: 'input-default',
    type: 'email',
    placeholder: 'example@company.com',
    disabled: false,
  },
  render: (args) => (
    <div className="grid w-80 max-w-[calc(100vw-2rem)] gap-2">
      <Label htmlFor={args.id}>メールアドレス</Label>
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    id: 'input-disabled',
    disabled: true,
    defaultValue: 'user@example.com',
  },
};

export const Invalid: Story = {
  args: {
    id: 'input-invalid',
    defaultValue: 'invalid-email',
    'aria-invalid': true,
    'aria-describedby': 'input-invalid-error',
  },
  render: (args) => (
    <div className="grid w-80 max-w-[calc(100vw-2rem)] gap-2">
      <Label htmlFor={args.id}>メールアドレス</Label>
      <Input {...args} />
      <p id="input-invalid-error" className="text-sm text-destructive">
        メールアドレスの形式で入力してください。
      </p>
    </div>
  ),
};
