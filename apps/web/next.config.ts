import type { NextConfig } from 'next';

// ブラウザテストでは、通常の開発環境と生成物・型設定を分ける。
const isBrowserE2E = process.env.BLUEMINE_BROWSER_E2E === '1';

const nextConfig: NextConfig = {
  // Next.js のビルド・実行時に生成するファイルの保存先。
  distDir: isBrowserE2E ? '.next-e2e' : '.next',
  // 招待画面の URL が移動先に伝わることや、画面の応答がキャッシュに
  // 保存されることを避けるため、HTTP 応答のヘッダーを設定する。
  // Next.js がこの関数を呼び出し、指定した URL にヘッダーを付ける。
  // async は Next.js の headers 設定で使う形式で、ここで通信を行うわけではない。
  async headers() {
    return [
      {
        // 招待画面の応答だけに、以下のヘッダーを適用する。
        source: '/invitation',
        headers: [
          // 画面から別の場所へ移動・通信するとき、参照元 URL を送らない。
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // ブラウザや共有キャッシュに、この画面の応答を保存させない。
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
  typescript: {
    // ブラウザテスト用の生成物は、専用の TypeScript 設定で扱う。
    tsconfigPath: isBrowserE2E ? 'tsconfig.browser-e2e.json' : 'tsconfig.json',
  },
};

export default nextConfig;
