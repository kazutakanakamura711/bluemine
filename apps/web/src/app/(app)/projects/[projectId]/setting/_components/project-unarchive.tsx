import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { unarchiveProject } from '../_lib/unarchive-project';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';

type ProjectUnarchiveProps = {
  projectId: string;
  onUnarchived: () => void;
};

export function ProjectUnarchive({
  projectId,
  onUnarchived,
}: ProjectUnarchiveProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleUnarchive = async () => {
    setSubmitError(null);
    setIsPending(true);

    try {
      await unarchiveProject(projectId);

      toast.add({
        type: 'success',
        title: 'プロジェクトのアーカイブを解除しました',
      });

      onUnarchived();
      // サイドバーやヘッダーを最新のアーカイブ状態で再描画する。
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="px-5 pb-6 sm:px-6">
      <Card className="max-w-150 rounded-lg">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">アーカイブ済み</CardTitle>
        </CardHeader>

        <CardContent className="pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                プロジェクトのアーカイブを解除
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                解除すると、タスクの作成・更新を再開できます。
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleUnarchive}
            >
              {isPending ? '処理中...' : 'アーカイブを解除'}
            </Button>
          </div>
          {submitError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
