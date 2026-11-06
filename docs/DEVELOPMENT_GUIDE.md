# 開発ガイド

Bluemine の機能を実装・確認する共通手順です。正式な仕様は [REQUIREMENTS.md](./REQUIREMENTS.md) を入口に確認します。

## 例: プロジェクト作成 API

新しい CRUD 機能は、毎回次の小さな順番で進める。

1. Prisma schema に必要な Model を書き、migration を作る。
2. `CreateProjectDto` を作り、API が受け取る値と入力チェックを定義する。
3. `ProjectsRepository.create()` を作り、Prisma で保存する処理を書く。
4. `ProjectsService.create()` を作り、入力の確認や必要な業務ルールを記述する。
5. `ProjectsController.create()` を作り、DTO を受けて Service を呼ぶ。
6. REST API の結合テスト（Vitest + Supertest）で、成功・入力エラー・存在しないデータなどを確認する。

```text
POST /projects
  -> CreateProjectDto
  -> ProjectsController.create()
  -> ProjectsService.create()
  -> ProjectsRepository.create()
  -> PrismaService
  -> PostgreSQL
```

## 作成・取得・更新・削除で最初に確認すること

| 操作 | 最初に考えること |
| --- | --- |
| 作成 | 必須項目は何か、重複を許すか、誰が作成できるか |
| 一覧取得 | 誰が閲覧できるか、並び順、ページネーションは必要か |
| 1件取得 | 対象が存在するか、閲覧権限があるか |
| 更新 | 更新できる項目、更新権限、不正な状態変更がないか |
| 削除 | 削除権限、関連データをどう扱うか、物理削除か論理削除か |

## テストの最小方針

最初は「API が期待どおり使えるか」を確認する結合テストを優先する。

- `POST /projects` が正しい入力で `201` を返す。
- 必須の `name` がなければ `400` を返す。
- 存在しない ID の `GET /projects/:id` は `404` を返す。
- 権限がないユーザーの更新・削除は `403` を返す。

単体テストは、計算、状態遷移、権限判定など、独立していて間違いやすいルールに絞る。Repository の内部実装や、単に別の関数を呼ぶだけの Controller のためにテストを量産しない。

## フロントエンドの確認手順

フロントエンドの機能を追加するときは、次の順番を目安にする。

1. shadcn/ui を土台に必要な UI 部品を追加・調整する。
2. 複数画面で使う UI は Storybook の story を作り、通常・空・disabled・エラーなどの状態を確認する。
3. フォーム入力、ボタン操作、表示の切り替えは Vitest + React Testing Library で確認する。
4. API との接続を含む主要導線だけを Playwright で確認する。

例えば `CreateProjectForm` なら、入力欄やバリデーション表示は Vitest、フォーム部品の見た目の確認は Storybook、実際にプロジェクトが作成できることは Playwright で確認する。

## 実装時の進め方

- 1回に1 endpoint だけ作る。
- 各ファイルを作る前に、「このファイルの責務」を1文で説明する。
- 先に完成コードを大量に貼らず、実装後に `Controller -> Service -> Repository` の流れを追う。
- 分からない用語は、その場で止めて確認する。
- 動作確認は Swagger / OpenAPI または Bruno などを使い、実際に API を呼ぶ。

## 初期セットアップの確認順

実装を始める前に、次を順番に確認する。

1. Docker Compose で PostgreSQL を起動する。
2. Prisma migration を適用し、NestJS から DB へ接続できることを確認する。
3. Next.js と NestJS をローカルの開発サーバーとして起動する。
4. `lint`、`typecheck`、最小のテストが実行できることを確認する。
5. Husky と lint-staged を導入し、commit 前に変更ファイルのフォーマット・lint が確認されるようにする。

Husky はミスを早く見つける補助であり、CI やテストの代わりではない。hook が遅くなり過ぎないよう、全テストや build は PR 前・CI で実行する。

Docker Compose・Supabase・Prisma の起動手順は [API README](../apps/api/README.md#開発)、ブラウザテストは [Playwright の手順](./PLAYWRIGHT_SETUP_GUIDE.md) を参照する。

## 今回はまだ導入しないもの

- 全 Repository の interface 化
- 1操作ごとの UseCase class
- Mapper の一律導入
- CQRS、Event Sourcing、Microservices
- 複雑な汎用 BaseRepository

これらは悪い設計ではないが、必要性が明確になった段階で導入した方が構成を保ちやすい。
