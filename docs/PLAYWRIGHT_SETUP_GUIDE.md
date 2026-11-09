# Playwright の実行手順

Bluemine のログイン・Project操作・Task操作を、実ブラウザから確認します。
APIだけの結合テストは `pnpm test:e2e`、ブラウザE2Eは `pnpm test:browser` です。
すべてのコマンドはリポジトリのルートで実行します。

## 準備

Node.js 24、pnpm 11.9.0、起動済みのDocker Desktopを用意します。

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

## 専用環境

接続先は [e2e/environment.mjs](../e2e/environment.mjs) が管理・検証します。

| 対象 | 接続先 |
| --- | --- |
| Web | `http://localhost:3100` |
| API | `http://localhost:3101` |
| アプリ用DB | `127.0.0.1:5434 / bluemine_browser_test` |
| Supabase | `http://127.0.0.1:55321` |
| テスト用メール | `http://127.0.0.1:55324` |

開発用DB・開発用Supabaseは使用しません。fixtureはランダムなテストユーザーとデータを用意し、終了時に今回作成したデータだけを削除します。
管理キーはNode.js側のfixtureで使い、Web/APIの環境変数へ渡したりログへ出力したりしません。

## 実行

```bash
pnpm test:browser:prepare
pnpm typecheck:browser
pnpm test:browser
```

`prepare` は専用環境の起動、既存migrationの適用、Prisma Client生成、専用のAPI/Web buildを行います。
APIは `apps/api/dist-e2e`、Webは `apps/web/.next-e2e` を使います。
設定は [playwright.config.mjs](../playwright.config.mjs)、テストは `e2e/tests/` にあります。

対象を絞る場合と、ブラウザを表示する場合:

```bash
pnpm test:browser e2e/tests/update-task.spec.ts
pnpm test:browser e2e/tests/update-task.spec.ts --headed
```

画面やAPIを変更した後は `pnpm test:browser:prepare` で専用buildを更新します。
テストでは固定sleepを使わず、画面の状態やAPI応答を待ちます。

メール確認のテストは `e2e/tests/email-confirmation.spec.ts` です。登録・確認後の手動ログイン、使用済みリンク、別ブラウザでの確認、ログイン中の別アカウントの確認リンクや無効なリンクによるセッション維持を確認します。
メールの取得・削除とユーザーの後片付けは、専用環境の今回のテストデータに限定します。

## 結果と終了

HTMLレポートを開きます。

```bash
pnpm exec playwright show-report
```

失敗時は `test-results/` にスクリーンショットとtraceを保存します。レポートと生成物はGit管理外です。
GitHub ActionsのBrowser E2E jobでも同じ専用環境を使います。

テストが失敗した場合も、最後に専用環境を終了します。

```bash
node e2e/stop.mjs
```

この停止コマンドは専用環境のテストデータを削除します。開発用環境の停止には使いません。
