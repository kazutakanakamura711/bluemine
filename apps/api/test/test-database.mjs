import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// DB 接続 URL から、接続先を見分けるための情報だけを取り出します。
// ユーザー名やパスワードではなく、ホスト・ポート・DB 名を使って比較します。
function parseDatabaseTarget(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} は有効な PostgreSQL URL にしてください。`);
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${variableName} は PostgreSQL URL にしてください。`);
  }

  // URL のパス部分が DB 名です。%20 など URL 用に変換された文字も元に戻します。
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !database || database.includes('/')) {
    throw new Error(`${variableName} にホストと DB 名を指定してください。`);
  }

  // localhost と 127.0.0.1、::1 は、いずれも自分の PC を指すため同じ扱いにします。
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const host = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    ? 'loopback'
    : hostname;

  // URL にポート番号がなければ、PostgreSQL の標準ポート 5432 を使います。
  return { host, port: url.port || '5432', database };
}

// テスト用 DB が安全な接続先かを確認し、問題がなければ URL を返します。
export function validateTestDatabaseUrl(
  testDatabaseUrl,
  developmentDatabaseUrl,
) {
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL が設定されていません。E2E 専用 DB を指定してください。',
    );
  }

  // 開発用 DB と「ホスト・ポート・DB 名」がすべて同じなら、誤って開発データを
  // テストで変更する危険があるため、ユーザー名などが違っていても実行を止めます。
  const testTarget = parseDatabaseTarget(testDatabaseUrl, 'TEST_DATABASE_URL');
  if (developmentDatabaseUrl) {
    const developmentTarget = parseDatabaseTarget(
      developmentDatabaseUrl,
      'DATABASE_URL',
    );
    if (
      testTarget.host === developmentTarget.host &&
      testTarget.port === developmentTarget.port &&
      testTarget.database === developmentTarget.database
    ) {
      throw new Error(
        'TEST_DATABASE_URL が開発用 DATABASE_URL と同じ DB を指しています。',
      );
    }
  }

  // DB 名にも _test を付け、テスト専用 DB であることを見分けやすくします。
  if (!testTarget.database.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL の DB 名は _test で終わる必要があります。',
    );
  }

  return testDatabaseUrl;
}

export function getTestDatabaseUrl() {
  // リポジトリ直下の .env を読み込み、TEST_DATABASE_URL などを利用できるようにします。
  // すでに環境変数が設定されている場合は、通常そちらの値が優先されます。
  config({
    // 読み込む .env ファイルの場所
    path: fileURLToPath(new URL('../../../.env', import.meta.url)),
    // 読み込み時の案内メッセージを表示しない設定
    quiet: true,
  });

  // 最初は DATABASE_URL が開発用 DB の URL です。
  // 一度記録した後は、DATABASE_URL がテスト用 URL に切り替わっても、記録した
  // 開発用 URL を比較に使い続けます。これにより、setupFiles が複数回呼ばれても
  // 「テスト用 DB と開発用 DB が同じか」を正しく確認できます。
  const developmentDatabaseUrl =
    process.env.BLUEMINE_E2E_DEVELOPMENT_DATABASE_URL ??
    process.env.DATABASE_URL;

  // テスト用 DB の URL があり、開発用 DB と別の接続先であることを確認します。
  const testDatabaseUrl = validateTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    developmentDatabaseUrl,
  );

  // 次回以降の呼び出しでも、最初に確認した開発用 URL を使えるよう保存します。
  // 環境変数には undefined を設定できないため、値がない場合は空文字にします。
  process.env.BLUEMINE_E2E_DEVELOPMENT_DATABASE_URL =
    developmentDatabaseUrl ?? '';

  // 検証済みの URL を、呼び出し元（E2E 実行処理）に返します。
  return testDatabaseUrl;
}
