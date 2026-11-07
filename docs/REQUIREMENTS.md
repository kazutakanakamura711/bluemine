# Bluemine - 要件

## この文書の位置づけ

Bluemine は、個人または少人数チーム向けのプロジェクト単位タスク管理アプリケーションである。

この文書は「何を作るか」と「どこまでを MVP にするか」を決める要件の入口である。実装の細部は、責務ごとに分けた以下の資料を参照する。

| 資料 | 内容 |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Next.js / NestJS の構成、Controller・Service・Repository の責務 |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | データの意味、入力・権限・業務ルール、段階的な追加範囲 |
| [ER.md](./ER.md) | 完成形を見据えたデータ関係 |
| [UI_API.md](./UI_API.md) | 画面、REST API、UI の実装順 |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | 1機能を実装・確認する手順 |

資料間で内容が矛盾する場合は、目的・MVP範囲は本書、データルールは `DOMAIN_MODEL.md`、URL・API契約は `UI_API.md` を優先する。

## プロダクトの目的

少人数チームまたは個人が、プロジェクトごとにタスクを登録・確認・更新できる Web アプリケーションを作る。

MVP では、Next.js と NestJS を用いて次の基盤を提供する。

- Next.js App Router と REST API を接続する
- NestJS の Controller、Service、Repository の役割を分ける
- Prisma と PostgreSQL でデータを保存する
- DTO による入力検証を行う
- Supabase Auth でログインユーザーを識別し、権限を確認する
- Vitest、Playwright を目的ごとに使い分ける

## 採用技術

| 領域 | 採用技術 |
| --- | --- |
| Frontend | Next.js、React、TypeScript、Tailwind CSS、shadcn/ui |
| Backend | NestJS、TypeScript、Prisma、PostgreSQL、class-validator |
| Authentication | Supabase Auth |
| API | REST API / JSON |
| Frontend test | Vitest、React Testing Library |
| Backend API test | Vitest、`@nestjs/testing`、Supertest |
| UI catalog | Storybook |
| E2E test | Playwright |
| Local development | Docker / Docker Compose |

ライブラリのバージョン、無料枠、デプロイ先は導入時に最新情報を確認して決める。

## MVP の実装順と到達点

MVP は「最初から完成形を実装する」ことではない。下記の小さな到達点を、順番に動作・テスト確認しながら進める。

### 1. 開発の土台

- Next.js、NestJS、PostgreSQL をローカルで起動できる
- PostgreSQL は Docker Compose で起動できる
- NestJS の `GET /api/health` が応答する
- lint、typecheck、テストを実行できる
- Husky により、commit 前にフォーマット・lint を確認できる

### 2. Project の基本 CRUD

- プロジェクトを作成できる
- プロジェクト一覧・詳細を表示できる
- プロジェクト名・説明を更新できる
- プロジェクトをアーカイブできる
- `key` の重複や必須入力を API 側で拒否できる

### 3. 認証と Project 権限

- Supabase Auth で登録・ログインできる
- API が access token を検証できる
- 認証済みのプロジェクト作成者を owner として登録できる
- Project の一覧・詳細は参加者に限定し、設定変更・アーカイブ・解除は owner のみに許可する
- owner が member と viewer を管理でき、閲覧・更新可否を API 側で確認できる

### 4. ブラウザ確認と UI カタログの導入

- ログインから Project の作成・更新・アーカイブ・解除までを Playwright で確認できる
- Playwright は専用データを使い、Pull Request の CI でも実行できる
- 既存の再利用 UI を Storybook で確認でき、カタログを build できる

### 5. Task の基本 CRUD と権限

- Project に属するタスクを作成できる
- タスク一覧・詳細を表示できる
- title、description、status、priority、日付を更新できる
- タスクを削除できる
- Project内で一意のタスク番号（例: `APP-12`）を、安全な採番処理とDBの一意制約で管理できる
- 同じProjectの参加者を任意の担当者として指定でき、参加情報の削除時は対象Projectの担当を解除する
- 報告者を作成者のUser参照として必ず記録する。担当者は未設定を許可する
- owner・member は作成・更新でき、削除は owner のみ、viewer は閲覧だけできる
- 別 Project のタスクを操作できず、アーカイブ済み Project のタスクを作成・更新・削除できない
- タスクの主要導線を Playwright に、再利用する Task UI の状態を Storybook に追加する

2026-10-29に、番号・担当者・報告者をTaskの基本機能へ段階的に追加する方針を合意した。Taskの一覧・詳細・作成・更新のAPIとWeb、安全な採番・担当者検証・報告者設定は実装済みである。Task削除APIはownerの権限とProjectの所属・アーカイブ状態を確認する。削除UIは後続の操作として進める。データルールは [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) を参照する。

### 6. 品質の確認

- フォームなどの UI 操作を Vitest で確認できる
- API の入力エラー・認可エラーを Vitest + Supertest で確認できる
- ログイン、プロジェクト作成、タスク作成の主要導線を Playwright で継続確認できる

## 完成後に追加を検討する機能

次の機能は、基本 CRUD と認証・権限を自分で理解して実装できるようになった後に判断する。

- コメントとタスク変更履歴
- 親子タスク
- ステータス・優先度・担当者による絞り込み
- ページネーション、全文検索
- `manager` role と詳細な権限設定
- Kanban、ガントチャート、ダッシュボード
- ファイル添付、通知、リアルタイム更新
- 外部 OAuth、二要素認証
- GraphQL、CQRS、Event Sourcing、Microservices

必要になっていない抽象化や機能を先回りして実装しない。

## ローカル開発と Git の品質チェック

### Docker / Docker Compose

- PostgreSQL は Docker Compose で起動する。ローカルへ直接インストールしなくても、チーム内で同じ DB バージョンを使えるようにするためである。
- 初期は Frontend と Backend をローカルの `pnpm dev` で起動し、DB だけを Docker で動かす。この方がログ確認やホットリロードを理解しやすい。
- Frontend / Backend まで Docker 化するのは、基本開発に慣れてから必要性を判断する。
- 環境変数は `.env` に置き、秘密情報を Git へ commit しない。必要な変数名だけを `.env.example` に記載する。

### Husky / lint-staged

- Husky は Git hook を管理する道具である。commit の前に決めた確認を自動実行する。
- `lint-staged` は、今回 commit するファイルだけを Prettier で整形し、不要に全ファイルへ時間をかけないために使う。
- `pre-commit` では `lint-staged` を実行し、フォーマット・lint の基本的なミスを早めに止める。
- 型チェック、全テスト、build は時間がかかるため、最初は Git hook に詰め込まず、PR 作成前や CI で実行する。
- Husky は package scripts と lint が動くことを確認してから、最初の機能実装前に導入する。

## 受け入れシナリオ

初期の完成判定は、次の操作を一通り行えることとする。

```text
アプリを起動する
  ↓
ログインする
  ↓
プロジェクトを作成する
  ↓
プロジェクト一覧と詳細を確認する
  ↓
タスクを作成する
  ↓
タスクの status を更新する
  ↓
タスク一覧に更新内容が反映される
```

別ユーザーのプロジェクトを取得・更新できないこと、viewer が更新できないことも確認する。

## 要件を変更するとき

- MVP に含める・含めない機能を変えるときは、本書を更新する。
- データ構造・入力・権限ルールを変えるときは、`DOMAIN_MODEL.md` と `ER.md` を更新する。
- 画面、URL、API request / response を変えるときは、`UI_API.md` を更新する。
- 構成や依存方向を変えるときは、`ARCHITECTURE.md` を更新する。
- 開発・実装の順番を変えるときは、`DEVELOPMENT_GUIDE.md` を更新する。
