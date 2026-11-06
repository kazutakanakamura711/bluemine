import { spawnSync } from 'node:child_process';
import {
  rootDirectory,
  validateBrowserE2EEnvironment,
} from './environment.mjs';

const environment = validateBrowserE2EEnvironment();
const composeProjectName = 'bluemine-browser-e2e';

if (
  environment.composeFile !== 'e2e/docker-compose.yml' ||
  environment.supabaseWorkdir !== 'e2e' ||
  environment.supabaseProjectId !== 'bluemine-browser-e2e' ||
  environment.supabaseNetwork !== 'bluemine-browser-e2e-network'
) {
  throw new Error('起動対象はブラウザE2E専用の設定に限定しています。');
}

function run(command, args, stdio = 'inherit') {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    stdio,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`${command} が ${result.signal} で終了しました。`);
  }
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || `${command} の実行に失敗しました。`,
    );
  }

  return result;
}

// 専用ネットワークがなければ作成する
const networkNames = run(
  'docker',
  ['network', 'ls', '--format', '{{.Name}}'],
  'pipe',
)
  .stdout.trim()
  .split('\n');

if (!networkNames.includes(environment.supabaseNetwork)) {
  run('docker', [
    'network',
    'create',
    '--opt',
    'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    environment.supabaseNetwork,
  ]);
}

// 既存のネットワークを使う場合も、設定が合っているか確認する
const [network] = JSON.parse(
  run('docker', ['network', 'inspect', environment.supabaseNetwork], 'pipe')
    .stdout,
);

if (
  network.Driver !== 'bridge' ||
  network.Options?.['com.docker.network.bridge.host_binding_ipv4'] !==
    '127.0.0.1'
) {
  throw new Error('専用ネットワークの公開先を 127.0.0.1 にしてください。');
}

// 専用DBを起動し、healthcheckの成功を待つ
run('docker', [
  'compose',
  '--project-name',
  composeProjectName,
  '-f',
  environment.composeFile,
  'up',
  '-d',
  '--wait',
]);

// 起動結果には管理キーが含まれるため、標準出力をログへ流さない。
run(
  'pnpm',
  [
    'exec',
    'supabase',
    'start',
    '--workdir',
    environment.supabaseWorkdir,
    '--network-id',
    environment.supabaseNetwork,
  ],
  ['inherit', 'ignore', 'inherit'],
);

console.log('ブラウザE2E環境を起動しました。');
