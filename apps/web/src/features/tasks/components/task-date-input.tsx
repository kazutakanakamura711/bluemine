'use client';

import { useState, type Ref } from 'react';
import { cn } from 'cn';
import { CalendarIcon } from 'lucide-react';
import { ja } from 'react-day-picker/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { formatDateOnly, toDateOnlyString } from '@/lib/format-date';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type TaskDateInputProps = {
  id: string;
  name: string;
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
  disabled?: boolean;
};

export function TaskDateInput({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  ref,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  className,
  disabled = false,
}: TaskDateInputProps) {
  // 選択日はフォームから受け取り、この部品ではカレンダーの開閉だけを管理する。
  const date = value ?? undefined;
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0">
      {/* 時刻を持たない日付なので、UTCへ変換せず選択した年月日を保持する。 */}
      <input
        type="hidden"
        name={name}
        value={date ? toDateOnlyString(date) : ''}
        disabled={disabled}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              ref={ref}
              onBlur={onBlur}
              aria-invalid={ariaInvalid}
              aria-describedby={ariaDescribedBy}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-between gap-2 text-left font-normal text-slate-800',
                className,
              )}
            />
          }
        >
          <span>{date ? formatDateOnly(date) : '年 /月 /日'}</span>
          <CalendarIcon
            aria-hidden="true"
            className="size-3.5 text-slate-600"
          />
        </PopoverTrigger>
        <PopoverContent
          aria-label={`${label}を選択`}
          align="end"
          initialFocus={false}
          className="w-auto max-w-[calc(100vw-2rem)] gap-0 p-0"
        >
          <Calendar
            mode="single"
            locale={ja}
            selected={date}
            defaultMonth={date}
            autoFocus
            disabled={disabled}
            onSelect={(selectedDate) => {
              onChange(selectedDate ?? null);
              setOpen(false);
            }}
            className="[--cell-size:--spacing(9)] md:[--cell-size:--spacing(8)]"
          />
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || !date}
              aria-label={`${label}をクリア`}
              className="w-full"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              クリア
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
