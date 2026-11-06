import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTestDatabaseUrl } from './test-database.mjs';

const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const testDatabaseUrl = getTestDatabaseUrl();

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: apiDirectory,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`${command} が ${result.signal} で終了しました。`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// migration だけにテスト DB の URL を渡す。Vitest 側は setup-env.ts が検証して切り替える。
run(
  'pnpm',
  ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'],
  {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  },
);
run(
  'pnpm',
  ['exec', 'vitest', 'run', '--config', './vitest.config.e2e.ts'],
  process.env,
);
