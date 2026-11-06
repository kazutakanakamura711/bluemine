'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { createProject } from '../_lib/create-project';

// NestJS の CreateProjectDto と同じ入力ルールを、画面でも検証する。
const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'プロジェクト名は必須です')
    .max(100, 'プロジェクト名は100文字以内で入力してください'),

  key: z
    .string()
    .trim()
    .min(1, 'プロジェクトキーは必須です')
    .max(20, 'プロジェクトキーは20文字以内で入力してください')
    .regex(/^[A-Za-z0-9]+$/, 'プロジェクトキーは英数字のみで入力してください'),

  description: z
    .string()
    .max(2000, '説明は2,000文字以内で入力してください')
    .optional(),
});

// Zod スキーマから、フォームの入力値の TypeScript 型を自動生成する。
type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

export function CreateProjectForm() {
  // 一覧画面へのクライアントサイド遷移に使う。
  const router = useRouter();

  // 特定の入力欄に紐付かない API エラーをフォーム上部に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectFormValues>({
    // resolverでReact Hook Form に「検証はこの Zod スキーマで行う」と伝える
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      key: '',
      description: '',
    },
  });

  const onSubmit = async (values: CreateProjectFormValues) => {
    // 前回の API エラーを消してから、新しい送信を始める。
    setSubmitError(null);

    try {
      await createProject({
        ...values,
        // 空文字の説明は API へ送らず、任意項目として扱う。
        description: values.description?.trim() || undefined,
      });

      // 作成成功後は、最新の一覧を表示する画面へ移動する。
      router.push('/projects');
      // 共通レイアウト内のサイドバーも再取得し、作成したプロジェクトを反映する。
      router.refresh();
    } catch (error) {
      if (error instanceof ProjectRequestError && error.statusCode === 409) {
        // キーの重複は key 項目のエラーとして表示する。
        setError('key', {
          type: 'server',
          message: error.message,
        });
        return;
      }

      // 通信失敗など、項目を特定できないエラーはフォーム上部に表示する。
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'プロジェクトの作成に失敗しました。',
      );
    }
  };

  return (
    <div className="px-5 py-6 sm:px-6">
      <Card className="max-w-150 rounded-lg">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">プロジェクト情報</CardTitle>
        </CardHeader>

        <CardContent className="pt-5">
          <form noValidate onSubmit={handleSubmit(onSubmit)}>
            {submitError && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">
                プロジェクト名 <span className="text-destructive">*</span>
              </Label>

              <Input
                id="name"
                placeholder="例: Task Management App"
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />

              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="mt-6 space-y-2">
              <Label htmlFor="key">
                プロジェクトキー <span className="text-destructive">*</span>
              </Label>

              <Input
                id="key"
                placeholder="例: APP"
                maxLength={20}
                aria-invalid={Boolean(errors.key)}
                aria-describedby="key-description"
                {...register('key')}
              />

              <p id="key-description" className="text-xs text-muted-foreground">
                英大文字・数字のみ、1〜20文字。タスク番号のプレフィックスになります（例:
                APP-12）。作成後の変更はタスク番号の表示に影響します。
              </p>

              {errors.key && (
                <p className="text-sm text-destructive">{errors.key.message}</p>
              )}
            </div>

            <div className="mt-6 space-y-2">
              <Label htmlFor="description">説明</Label>

              <Textarea
                id="description"
                placeholder="プロジェクトの概要・目的を記載してください"
                maxLength={2000}
                rows={4}
                aria-invalid={Boolean(errors.description)}
                {...register('description')}
              />

              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row-reverse sm:items-center sm:justify-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"
              >
                {isSubmitting ? '作成中...' : 'プロジェクトを作成'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => router.push('/projects')}
                className="w-full sm:w-auto"
              >
                キャンセル
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
