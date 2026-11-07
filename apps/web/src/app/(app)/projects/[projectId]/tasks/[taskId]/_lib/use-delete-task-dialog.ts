'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from '@/components/ui/toast';
import { deleteTask, DeleteTaskRequestError } from './delete-task';

type UseDeleteTaskDialogOptions = {
  projectId: string;
  taskId: string;
};

// 削除確認の状態とAPIへの送信、成功後の遷移を管理する。
export function useDeleteTaskDialog({
  projectId,
  taskId,
}: UseDeleteTaskDialogOptions) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 再描画前の連続操作や、削除成功後の画面移動中も二重送信を防ぐ。
  const deleteLock = useRef(false);

  function handleOpenChange(open: boolean): boolean {
    // 送信中は閉じる通知を取り消すよう、呼び出し元に伝える。
    if (deleteLock.current) return false;

    setIsOpen(open);
    if (!open) setDeleteError(null);
    return true;
  }

  async function handleDelete() {
    if (!isOpen || deleteLock.current) return;

    deleteLock.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteTask(projectId, taskId);
    } catch (error) {
      deleteLock.current = false;
      setIsDeleting(false);
      setDeleteError(
        error instanceof DeleteTaskRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
      return;
    }

    // 成功後の表示と遷移は、API失敗時の処理とは分ける。
    toast.add({ type: 'success', title: 'タスクを削除しました' });
    setIsOpen(false);
    router.replace(`/projects/${encodeURIComponent(projectId)}/tasks`);
    router.refresh();
  }

  return { isOpen, isDeleting, deleteError, handleOpenChange, handleDelete };
}
