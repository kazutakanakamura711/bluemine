# Bluemine

Bluemine は、少人数向けのプロジェクト・タスク管理アプリケーションです。
Next.js のフロントエンドと NestJS の REST API を使い、PostgreSQL に保存します。

## 構成

```text
apps/web  Next.js / React / TypeScript / shadcn/ui
apps/api  NestJS / Prisma / PostgreSQL
e2e       Playwright と専用のテスト環境
supabase  ローカル認証の設定・メールテンプレート
```

Backend は機能単位のレイヤード構成です。

```text
Controller -> Service -> Repository -> PrismaService -> PostgreSQL
```

## 仕様と開発ルール

- [REQUIREMENTS.md](./REQUIREMENTS.md): 要件の入口とMVP範囲
- [DOMAIN_MODEL.md](./DOMAIN_MODEL.md): データと業務ルール
- [UI_API.md](./UI_API.md): 画面・URL・REST API契約
- [ARCHITECTURE.md](./ARCHITECTURE.md): 構成と各層の責務
- [ER.md](./ER.md): データの関係
- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md): 実装・確認の共通手順
- [PULL_REQUEST_GUIDE.md](./PULL_REQUEST_GUIDE.md): PR作成・確認の手順

## 起動と確認

Node.js 24、pnpm 11.9.0、Docker Desktop を使用します。コマンドはリポジトリのルートで実行します。

```bash
pnpm install --frozen-lockfile
```

環境変数とDB・Supabaseを [API README](../apps/api/README.md#開発) に従って準備し、別々のターミナルで起動します。

```bash
pnpm dev:api
pnpm dev:web
```

Web は `http://localhost:3000`、API は `http://localhost:3001/api`、Swagger は `http://localhost:3001/api/docs` です。

| 対象 | 手順 |
| --- | --- |
| API・DB・Supabase・API E2E | [API README](../apps/api/README.md) |
| Web・環境変数 | [Web README](../apps/web/README.md) |
| APIの手動確認 | [Bruno README](../bruno/README.md) |
| ブラウザE2E | [Playwright](./PLAYWRIGHT_SETUP_GUIDE.md) |
| UIカタログ | [Storybook](./STORYBOOK_SETUP_GUIDE.md) |

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

## 文書の管理

正式仕様・アーキテクチャ・開発ルール・共有する実行手順をGitで管理します。
個人向けの学習メモ、作業履歴、ToDo、詰まり対応、調査レポートは `docs/local/` に保存し、Gitの対象から外します。

アプリの表示名は `Bluemine`、package名は `bluemine` / `@bluemine/*` です。DB・Docker・Supabaseの内部識別名とBrunoのディレクトリ名も `bluemine` をもとに揃えています。開発用・テスト用の環境は、それぞれ区別できる名前を使います。
