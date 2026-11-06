import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const items = [
  { value: 'todo', label: '未着手' },
  { value: 'in_progress', label: '進行中' },
  { value: 'done', label: '完了' },
];

function SelectPreview({
  disabled,
  defaultValue,
}: {
  disabled: boolean;
  defaultValue: string | null;
}) {
  return (
    <div className="w-64 space-y-2">
      <Label htmlFor="preview-status">ステータス</Label>
      <Select
        name="status"
        items={items}
        defaultValue={defaultValue}
        disabled={disabled}
      >
        <SelectTrigger id="preview-status" className="w-full">
          <SelectValue placeholder="ステータスを選択" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const meta = {
  title: 'UI/Select',
  component: SelectPreview,
  args: { disabled: false, defaultValue: 'todo' },
} satisfies Meta<typeof SelectPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Placeholder: Story = { args: { defaultValue: null } };
export const Disabled: Story = { args: { disabled: true } };
