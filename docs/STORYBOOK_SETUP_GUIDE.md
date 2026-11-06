# Storybook の実行手順

Bluemine の再利用UIやフォームにpropsを渡し、画面から切り離して状態を確認するカタログです。
コマンドはリポジトリのルートで実行します。

## 起動・表示・終了

```bash
pnpm install --frozen-lockfile
pnpm storybook
```

`http://127.0.0.1:6006` を開きます。終了は起動したターミナルで `Ctrl+C` です。
UI部品・タスク一覧・作成フォーム・編集Sheetなどのstoryから、通常・未設定・disabled・入力エラー・送信中・保存失敗などの状態を確認します。

カタログの確認には、Web/APIの開発サーバーやDBは不要です。Taskの作成・更新APIはStorybook用のmockを使用します。

## 構成

| ファイル | 役割 |
| --- | --- |
| [.storybook/main.ts](../apps/web/.storybook/main.ts) | Next.js向けframework、storyの検索先、telemetryの設定 |
| [.storybook/preview.ts](../apps/web/.storybook/preview.ts) | 共通CSS、レイアウト、API mock |
| [.storybook/preview.css](../apps/web/.storybook/preview.css) | Storybook用のフォント設定 |

storyは `apps/web/src/` 配下の `*.stories.tsx` に置きます。アプリと同じ共通CSSを読み込み、Storybookのフォントはシステムフォントを使います。

## 変更時の確認

PCとモバイル幅、長い文字列、入力エラー、disabled状態、非同期処理中の表示を確認します。
部品の操作と結果はVitest + React Testing Library、APIとつながる主要導線はPlaywrightで確認します。

```bash
pnpm --filter @bluemine/web lint
pnpm --filter @bluemine/web typecheck
pnpm --filter @bluemine/web test
pnpm storybook:build
```

## build とCI

```bash
pnpm storybook:build
```

`apps/web/storybook-static` に静的カタログを生成します。生成物はGit管理外で、このコマンドによる公開・デプロイは行いません。
GitHub ActionsのQuality checks jobでもbuildを確認します。実際の配色・レイアウト・操作は、カタログを開いて別途確認します。
