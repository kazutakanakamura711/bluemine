import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 同じDBでテーブルロックを使うため、別ファイルのテストが干渉しないよう順次実行する。
    // 各テスト内の並行リクエストによる競合検証は維持する。
    fileParallelism: false,
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
  },
});
