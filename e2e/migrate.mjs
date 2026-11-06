import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  rootDirectory,
  validateBrowserE2EEnvironment,
} from './environment.mjs';

const environment = validateBrowserE2EEnvironment();

const result = spawnSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'],
  {
    cwd: resolve(rootDirectory, 'apps/api'),
    env: {
      ...process.env,
      DATABASE_URL: environment.databaseUrl,
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}
if (result.signal) {
  throw new Error(`migration が ${result.signal} で終了しました。`);
}
if (result.status !== 0) {
  throw new Error('ブラウザE2E用DBへのmigrationの適用に失敗しました。');
}

console.log('ブラウザE2E用DBへのmigrationの適用が完了しました。');
