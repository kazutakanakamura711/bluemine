import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ja } from 'react-day-picker/locale';

import { Calendar } from '@/components/ui/calendar';

function CalendarPreview({ disabled }: { disabled: boolean }) {
  const [date, setDate] = useState<Date>();
  return (
    <Calendar
      mode="single"
      locale={ja}
      selected={date}
      defaultMonth={new Date(2026, 9, 1)}
      onSelect={setDate}
      disabled={disabled}
      className="rounded-lg border [--cell-size:--spacing(9)]"
    />
  );
}

const meta = {
  title: 'UI/Calendar',
  component: CalendarPreview,
  args: { disabled: false },
} satisfies Meta<typeof CalendarPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
