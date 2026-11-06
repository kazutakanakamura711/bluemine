'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

import { addProjectMember } from '../_lib/add-project-member';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import {
  ProjectRole,
  ProjectRoleDisplayText,
} from '@/features/projects/types/project-role';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';

// 追加 API と同じく、メールは trim し、権限は member・viewer に限定する。
const addProjectMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'メールアドレスは必須です')
    .pipe(z.email({ error: 'メールアドレスの形式が正しくありません' })),

  role: z.enum([ProjectRole.Member, ProjectRole.Viewer], {
    error: '権限はメンバーまたは閲覧者を選択してください',
  }),
});
// Zod スキーマから、フォームの入力値の TypeScript 型を自動生成する。
type AddProjectMemberFormValues = z.infer<typeof addProjectMemberSchema>;

type AddProjectMemberDialogProps = {
  projectId: string;
  isArchived: boolean;
};

// 追加フォームの開閉・入力検証・送信と、その結果の表示を扱う。
export function AddProjectMemberDialog({
  projectId,
  isArchived,
}: AddProjectMemberDialogProps) {
  // 一覧画面へのクライアントサイド遷移に使う。
  const router = useRouter();
  // ダイアログの開閉。
  const [isOpen, setIsOpen] = useState(false);
  // 特定の入力欄に紐付かない API エラーをフォーム上部に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddProjectMemberFormValues>({
    resolver: zodResolver(addProjectMemberSchema),
    // 初回は送信時に検証し、送信後は入力変更時に再検証する。
    mode: 'onSubmit',
    defaultValues: {
      email: '',
      role: ProjectRole.Member,
    },
  });

  const handleOpenChange = (open: boolean) => {
    // 閉じても送信は中断されないため、送信中は Escape キーによる閉じる操作も止める。
    if (isSubmitting) {
      return;
    }

    setIsOpen(open);
    // 開き直したときに前回の入力・エラーを残さない。
    if (!open) {
      reset();
      setSubmitError(null);
    }
  };

  const onSubmit = async (values: AddProjectMemberFormValues) => {
    setSubmitError(null);

    try {
      await addProjectMember(projectId, values);
    } catch (error) {
      // 404・409 は複数の理由があるため、status だけで原因を決めない。
      setSubmitError(
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
      return;
    }

    // 保存成功後の処理は API エラーの処理から分ける。
    toast.add({ type: 'success', title: 'メンバーを追加しました' });
    reset();
    setIsOpen(false);
    router.refresh();
  };
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <Dialog
        open={isOpen}
        disablePointerDismissal={isSubmitting}
        onOpenChange={handleOpenChange}
      >
        <DialogTrigger
          disabled={isArchived || isSubmitting}
          aria-describedby={
            isArchived ? 'add-project-member-archived-description' : undefined
          }
          render={
            <Button
              type="button"
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"
            />
          }
        >
          <Plus aria-hidden="true" />
          メンバーを追加
        </DialogTrigger>

        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-3 max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-y-auto rounded-lg p-0 sm:top-1/2 sm:bottom-auto sm:max-w-120 sm:-translate-y-1/2"
        >
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-sm leading-6 font-semibold">
              メンバーを追加
            </DialogTitle>
          </DialogHeader>

          <form
            className="space-y-6 px-5 py-5"
            noValidate
            aria-busy={isSubmitting}
            onSubmit={handleSubmit(onSubmit)}
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="add-project-member-email">
                メールアドレス
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="add-project-member-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="member@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email
                    ? 'add-project-member-email-description add-project-member-email-error'
                    : 'add-project-member-email-description'
                }
                required
                disabled={isSubmitting || isArchived}
                {...register('email')}
              />
              {errors.email && (
                <p
                  id="add-project-member-email-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.email.message}
                </p>
              )}
              <DialogDescription
                id="add-project-member-email-description"
                className="text-xs leading-relaxed"
              >
                追加する相手は、メール確認後に一度このアプリへログインしてください。
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-project-member-role">
                権限
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <select
                id="add-project-member-role"
                required
                disabled={isSubmitting || isArchived}
                aria-invalid={Boolean(errors.role)}
                aria-describedby={
                  errors.role ? 'add-project-member-role-error' : undefined
                }
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                {...register('role')}
              >
                <option value={ProjectRole.Member}>
                  {ProjectRoleDisplayText[ProjectRole.Member]}
                </option>
                <option value={ProjectRole.Viewer}>
                  {ProjectRoleDisplayText[ProjectRole.Viewer]}
                </option>
              </select>
              {errors.role && (
                <p
                  id="add-project-member-role-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.role.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-end">
              <Button
                type="submit"
                disabled={isSubmitting || isArchived}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"
              >
                {isSubmitting ? '追加中...' : '追加'}
              </Button>
              <DialogClose
                disabled={isSubmitting}
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                  />
                }
              >
                キャンセル
              </DialogClose>
            </div>
          </form>

          <DialogClose
            aria-label="閉じる"
            disabled={isSubmitting}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3 text-muted-foreground"
              />
            }
          >
            <X aria-hidden="true" />
          </DialogClose>
        </DialogContent>
      </Dialog>

      {isArchived && (
        <p
          id="add-project-member-archived-description"
          className="text-xs leading-relaxed text-muted-foreground sm:max-w-64"
        >
          アーカイブ済みのため、メンバーを追加できません。
        </p>
      )}
    </div>
  );
}
