import { spawn } from 'node:child_process';
import { rootDirectory, getBrowserE2EAppEnvironments } from './environment.mjs';

const app = process.argv[2];
if (app !== 'api' && app !== 'web') {
  throw new Error('起動対象には api または web を指定してください。');
}

// 設定の読み込み時には接続せず、実際のサーバー起動時にだけ取得する。
const environments = getBrowserE2EAppEnvironments();
const command = app === 'api' ? process.execPath : 'pnpm';
const args =
  app === 'api'
    ? ['apps/api/dist-e2e/main.js']
    : ['--filter', '@bluemine/web', 'start', '--hostname', '127.0.0.1'];

const child = spawn(command, args, {
  cwd: rootDirectory,
  env: { ...process.env, ...environments[app] },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

// 子プロセスの失敗をPlaywrightへ伝える。終了時のSIGTERMはプロセスグループ全体に届く。
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
