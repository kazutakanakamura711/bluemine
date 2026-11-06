'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { updateProject } from '../_lib/update-project';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';

// UpdateProjectDto と同じ入力ルールを、画面でも検証する。
const projectSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'プロジェクト名は必須です')
    .max(100, 'プロジェクト名は100文字以内で入力してください'),

  // フォーム上では常に文字列として扱う。
  // 空文字は API 側で null（説明なし）に正規化される。
  description: z.string().max(2000, '説明は2,000文字以内で入力してください'),
});

type ProjectSettingsFormValues = z.infer<typeof projectSettingsSchema>;

type ProjectSettingsFormProps = {
  projectId: string;
  initialName: string;
  projectKey: string;
  initialDescription: string | null;
};

export function ProjectSettingsForm({
  projectId,
  initialName,
  projectKey,
  initialDescription,
}: ProjectSettingsFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectSettingsFormValues>({
    resolver: zodResolver(projectSettingsSchema),
    // 初回は保存時に検証し、エラー後は入力のたびに再検証する。
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: initialName,
      description: initialDescription ?? '',
    },
  });

  const onSubmit = async (values: ProjectSettingsFormValues) => {
    // 前回の API エラーを消してから、新しい送信を始める。
    setSubmitError(null);

    try {
      await updateProject(projectId, values);

      // 保存成功を右下の一時通知で伝える。
      toast.add({
        type: 'success',
        title: 'プロジェクト設定を保存しました',
      });

      // Server Component が最新のプロジェクト情報を再取得する。
      router.refresh();
    } catch (error) {
      setSubmitError(
        // API が返す業務エラーはそのまま表示し、通信失敗は日本語の案内にする。
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
    }
  };

  return (
    <div className="px-5 py-6 sm:px-6">
      <Card className="max-w-150 rounded-lg">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">基本設定</CardTitle>
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
              <Label htmlFor="project-key">プロジェクトキー</Label>
              <Input
                id="project-key"
                value={projectKey}
                readOnly
                aria-describedby="project-key-description"
                className="bg-muted text-muted-foreground"
              />
              <p
                id="project-key-description"
                className="text-xs text-muted-foreground"
              >
                プロジェクトキーは作成後に変更できません。
              </p>
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

            <div className="mt-6">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isSubmitting ? '保存中...' : '設定を保存'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
