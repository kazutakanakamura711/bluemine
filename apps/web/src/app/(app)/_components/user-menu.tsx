'use client';

import { ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { LogoutButton } from './logout-button';

type UserMenuProps = {
  userName: string;
  userEmail: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function UserMenu({
  userName,
  userEmail,
  open,
  onOpenChange,
}: UserMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="ユーザーメニュー"
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full min-w-0 justify-start gap-2 rounded-md px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-indigo-600"
          />
        }
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700"
        >
          {userName.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{userName}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {userEmail}
          </span>
        </span>
        <ChevronUp
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      {/* 開閉する内容を子で描画し、LogoutButton 自体の状態は保持する。 */}
      <LogoutButton />
    </DropdownMenu>
  );
}
