import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

function PopoverPreview() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        詳細を表示
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>ポップオーバー</PopoverTitle>
          <PopoverDescription>
            ボタンの近くに補足情報を表示します。
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

const meta = { title: 'UI/Popover', component: PopoverPreview } satisfies Meta<
  typeof PopoverPreview
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
