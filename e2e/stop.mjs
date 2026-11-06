import { spawnSync } from 'node:child_process';
import {
  rootDirectory,
  validateBrowserE2EEnvironment,
} from './environment.mjs';

const environment = validateBrowserE2EEnvironment();
const composeProjectName = 'bluemine-browser-e2e';

// 停止対象を指定する設定も、専用環境のものか確認する
if (
  environment.composeFile !== 'e2e/docker-compose.yml' ||
  environment.supabaseWorkdir !== 'e2e' ||
  environment.supabaseProjectId !== 'bluemine-browser-e2e'
) {
  throw new Error('停止対象はブラウザE2E専用の設定に限定しています。');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
  } else if (result.signal || result.status !== 0) {
    console.error(`${command} が正常に終了しませんでした。`);
    process.exitCode = 1;
  }
}

// 専用Supabaseを停止し、テスト用データも削除する
run('pnpm', [
  'exec',
  'supabase',
  'stop',
  '--workdir',
  environment.supabaseWorkdir,
  '--project-id',
  environment.supabaseProjectId,
  '--no-backup',
]);

// 専用DBのコンテナと、Composeが作成したネットワークを削除する
run('docker', [
  'compose',
  '--project-name',
  composeProjectName,
  '-f',
  environment.composeFile,
  'down',
]);

if (!process.exitCode) {
  console.log('ブラウザE2E環境を終了しました。');
}
