import { spawnSync } from 'node:child_process';
import { rootDirectory, getBrowserE2EAppEnvironments } from './environment.mjs';

const { api, web } = getBrowserE2EAppEnvironments();

function run(args, environment) {
  const result = spawnSync('pnpm', args, {
    cwd: rootDirectory,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal || result.status !== 0) {
    throw new Error('ブラウザE2E用のビルドに失敗しました。');
  }
}

// APIが使うPrisma Clientを生成する
run(
  [
    '--filter',
    '@bluemine/api',
    'exec',
    'prisma',
    'generate',
    '--config',
    'prisma7.config.ts',
  ],
  api,
);

// 専用のTypeScript設定でAPIをビルドする
run(
  [
    '--filter',
    '@bluemine/api',
    'exec',
    'nest',
    'build',
    '--path',
    'tsconfig.browser-e2e.json',
  ],
  api,
);

// 専用の環境変数でWebをビルドする
run(['--filter', '@bluemine/web', 'build'], web);

console.log('ブラウザE2E用のビルドが完了しました。');
