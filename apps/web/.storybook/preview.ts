import type { Preview } from '@storybook/nextjs-vite';
import { sb } from 'storybook/test';

import '../src/app/globals.css';
import './preview.css';

// Storybookで作成・保存ボタンを押しても実際のAPIへ保存せず、各storyで結果を設定する。
sb.mock('../src/app/(app)/projects/[projectId]/tasks/new/_lib/create-task.ts');
sb.mock(
  '../src/app/(app)/projects/[projectId]/tasks/[taskId]/_lib/update-task.ts',
);

const preview: Preview = {
  parameters: {
    layout: 'centered',
  },
};

export default preview;
