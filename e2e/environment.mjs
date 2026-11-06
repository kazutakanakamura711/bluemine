import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// このファイルの場所を基準に、プロジェクトのルートを取得する
export const rootDirectory = fileURLToPath(new URL('../', import.meta.url));

export const browserE2E = {
  // アプリケーション用DB
  composeFile: 'e2e/docker-compose.yml',
  databaseUrl:
    'postgresql://bluemine_browser_test:browser-test-only@127.0.0.1:5434/bluemine_browser_test?schema=public',

  // 認証・メール確認用のSupabase
  supabaseWorkdir: 'e2e',
  supabaseProjectId: 'bluemine-browser-e2e',
  supabaseNetwork: 'bluemine-browser-e2e-network',
  supabaseUrl: 'http://127.0.0.1:55321',
  mailUrl: 'http://127.0.0.1:55324',

  // 今後起動するブラウザE2E用のWeb・API
  webUrl: 'http://localhost:3100',
  apiUrl: 'http://localhost:3101',
};

// URLとして読み取れない値なら、分かりやすいエラーにする
function parseEnvironmentUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} に有効な URL を指定してください。`);
  }
}

// DBや認証ユーザーを変更する処理の前に呼び出す
export function validateBrowserE2EEnvironment(environment = browserE2E) {
  const databaseUrl = parseEnvironmentUrl(
    environment.databaseUrl,
    'databaseUrl',
  );

  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    databaseUrl.hostname !== '127.0.0.1' ||
    databaseUrl.port !== '5434' ||
    databaseUrl.pathname !== '/bluemine_browser_test' ||
    databaseUrl.search !== '?schema=public' ||
    databaseUrl.hash !== ''
  ) {
    throw new Error(
      'ブラウザE2EのDBは 127.0.0.1:5434 の bluemine_browser_test（schema=public）に限定しています。',
    );
  }

  const supabaseUrl = parseEnvironmentUrl(
    environment.supabaseUrl,
    'supabaseUrl',
  );

  if (supabaseUrl.href !== 'http://127.0.0.1:55321/') {
    throw new Error(
      'ブラウザE2EのSupabaseは http://127.0.0.1:55321 に限定しています。',
    );
  }

  const mailUrl = parseEnvironmentUrl(environment.mailUrl, 'mailUrl');
  if (mailUrl.href !== 'http://127.0.0.1:55324/') {
    throw new Error(
      'ブラウザE2Eのメール受信先は http://127.0.0.1:55324 に限定しています。',
    );
  }

  return environment;
}

function getBrowserE2ESupabaseStatus() {
  const environment = validateBrowserE2EEnvironment();

  if (
    environment.supabaseWorkdir !== 'e2e' ||
    environment.supabaseProjectId !== 'bluemine-browser-e2e' ||
    environment.webUrl !== 'http://localhost:3100' ||
    environment.apiUrl !== 'http://localhost:3101'
  ) {
    throw new Error('Web/APIの接続先はブラウザE2E専用の設定に限定しています。');
  }

  // CLIの出力を文字列として受け取る
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'supabase',
      'status',
      '--workdir',
      environment.supabaseWorkdir,
      '--output',
      'json',
    ],
    {
      cwd: rootDirectory,
      stdio: 'pipe',
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.signal || result.status !== 0) {
    throw new Error(
      '専用Supabaseの状態を取得できません。Docker Desktopを起動し、pnpm test:browser:prepare を実行してください。',
    );
  }

  let status;
  try {
    status = JSON.parse(result.stdout);
  } catch {
    throw new Error('専用Supabaseの状態をJSONとして読み取れませんでした。');
  }

  // 設定値だけでなく、CLIが返した実際のURLも検証する
  validateBrowserE2EEnvironment({
    ...environment,
    supabaseUrl: status?.API_URL,
  });

  return { environment, status };
}

export function getBrowserE2EAppEnvironments() {
  const { environment, status } = getBrowserE2ESupabaseStatus();
  const publishableKey = status.PUBLISHABLE_KEY;
  if (
    typeof publishableKey !== 'string' ||
    !publishableKey.startsWith('sb_publishable_')
  ) {
    throw new Error('専用SupabaseのPublishable keyを取得できませんでした。');
  }

  // Web/APIへ渡す、上書き用の環境変数を返す
  return {
    api: {
      DATABASE_URL: environment.databaseUrl,
      API_PORT: new URL(environment.apiUrl).port,
      WEB_ORIGIN: environment.webUrl,
      SUPABASE_URL: environment.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
    web: {
      PORT: new URL(environment.webUrl).port,
      NEXT_PUBLIC_API_BASE_URL: `${environment.apiUrl}/api`,
      NEXT_PUBLIC_SUPABASE_URL: environment.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      BLUEMINE_BROWSER_E2E: '1',
    },
  };
}

// 管理キーはNode.jsで動くfixtureだけに渡し、Web/APIの環境変数へ含めない。
export function getBrowserE2EAdminCredentials() {
  const { environment, status } = getBrowserE2ESupabaseStatus();
  const secretKey = status.SECRET_KEY;

  if (typeof secretKey !== 'string' || !secretKey.startsWith('sb_secret_')) {
    throw new Error('専用SupabaseのSecret keyを取得できませんでした。');
  }

  return { supabaseUrl: environment.supabaseUrl, secretKey };
}
