'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { archiveProject } from '../_lib/archive-project';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';

const archiveConfirmationSchema = z.object({
  projectName: z.string().trim().min(1, 'プロジェクト名を入力してください'),
});

type ArchiveConfirmationValues = z.infer<typeof archiveConfirmationSchema>;

type ProjectArchiveProps = {
  projectId: string;
  projectName: string;
  onArchived: () => void;
};

export function ProjectArchive({
  projectId,
  projectName,
  onArchived,
}: ProjectArchiveProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ArchiveConfirmationValues>({
    resolver: zodResolver(archiveConfirmationSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      projectName: '',
    },
  });

  // GitHub のリポジトリ削除と同様に、確認名が完全に一致するまで実行できないようにする。
  const confirmationName = useWatch({
    control,
    name: 'projectName',
  });
  const isConfirmationNameMatched = confirmationName === projectName;

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

  const onSubmit = async (values: ArchiveConfirmationValues) => {
    setSubmitError(null);
    clearErrors('projectName');

    // 誤操作防止のため、表示中のプロジェクト名と完全に一致した場合だけ実行する。
    if (values.projectName !== projectName) {
      setError('projectName', {
        type: 'validate',
        message: 'プロジェクト名が一致しません。',
      });
      return;
    }

    try {
      await archiveProject(projectId);

      toast.add({
        type: 'success',
        title: 'プロジェクトをアーカイブしました',
      });
      setIsOpen(false);
      onArchived();
      // サイドバーやヘッダーを最新のアーカイブ状態で再描画する。
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
    }
  };

  return (
    <div className="px-5 pb-6 sm:px-6">
      <Card className="max-w-150 rounded-lg ring-destructive/30">
        <CardHeader className="border-b border-destructive/30">
          <CardTitle className="text-base text-destructive">
            Danger Zone
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium">プロジェクトをアーカイブ</p>
              <p className="mt-1 text-xs text-muted-foreground">
                アーカイブすると、このプロジェクトのタスク作成・更新が無効になります。
                <br />
                既存のデータは保持され、閲覧は引き続き可能です。この操作はオーナーのみ実行できます。
              </p>
            </div>

            <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
              <AlertDialogTrigger
                render={
                  <Button className="bg-red-600 text-white hover:bg-red-700">
                    アーカイブ
                  </Button>
                }
              />

              <AlertDialogContent
                size="lg"
                className="gap-0 overflow-hidden rounded-md p-0"
              >
                <form noValidate onSubmit={handleSubmit(onSubmit)}>
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <AlertDialogTitle className="text-base font-semibold">
                      プロジェクトをアーカイブ
                    </AlertDialogTitle>
                    <AlertDialogCancel
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="閉じる"
                      disabled={isSubmitting}
                      className="size-7 text-muted-foreground hover:text-foreground"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </AlertDialogCancel>
                  </div>

                  <div className="space-y-5 px-5 py-6">
                    <AlertDialogDescription className="text-sm leading-relaxed text-foreground">
                      「{projectName}
                      」をアーカイブします。タスクの作成・更新が無効になります。確認のためプロジェクト名を入力してください。
                    </AlertDialogDescription>

                    {submitError && (
                      <Alert variant="destructive">
                        <AlertDescription>{submitError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label
                        htmlFor="archive-confirmation-name"
                        className="block leading-relaxed"
                      >
                        確認のため{' '}
                        <span className="wrap-break-word font-semibold">
                          {projectName}
                        </span>{' '}
                        と入力してください。
                      </Label>
                      <Input
                        id="archive-confirmation-name"
                        placeholder={projectName}
                        autoComplete="off"
                        aria-invalid={Boolean(errors.projectName)}
                        {...register('projectName')}
                      />
                      {errors.projectName && (
                        <p className="text-sm text-destructive">
                          {errors.projectName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-border bg-muted/50 px-5 py-4">
                    <AlertDialogCancel type="button" disabled={isSubmitting}>
                      キャンセル
                    </AlertDialogCancel>
                    <Button
                      type="submit"
                      disabled={!isConfirmationNameMatched || isSubmitting}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {isSubmitting ? 'アーカイブ中...' : 'アーカイブする'}
                    </Button>
                  </div>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
