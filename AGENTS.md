# AGENTS.md

## 目的

Bluemine は、少人数向けのプロジェクト・タスク管理アプリケーションである。複雑な抽象化より、各ファイルの責務が明確で読みやすい構成を優先する。

正式な仕様は `docs/REQUIREMENTS.md` を入口とし、データルールは `docs/DOMAIN_MODEL.md`、画面・APIは `docs/UI_API.md`、構成は `docs/ARCHITECTURE.md` を参照する。

## 構成方針

Backend は現在、機能単位のレイヤード構成とする。業務ルールを理解・実装した後、対象の操作ごとに DDD のモデル化、クリーンアーキテクチャによる依存関係の整理へ進む。段階と責務は `docs/ARCHITECTURE.md` に従う。

```text
Controller -> Service -> Repository -> PrismaService -> PostgreSQL
```

- Controller は HTTP、DTO、response を扱い、Prisma query や複雑な業務判断を書かない。
- 現段階の Service は機能の処理順・認可・業務ルールを扱い、HTTP の Request / Response を受け取らない。DDD を導入した操作では、モデルが守る業務ルールをドメインモデルへ移し、Service はデータ取得・保存と処理順を扱う。
- Repository は Prisma を使った DB 操作を扱い、HTTP の知識を持たない。
- 現段階では Repository interface、UseCase class、Mapper、汎用 BaseRepository を機械的に増やさない。依存関係を整理する段階に進んだ操作では、Repository interface と UseCase を導入し、それぞれの役割を説明する。
- API では認証済みユーザー、Project membership、role を必ず検証する。UI の表示制御だけを信頼しない。

### DDD・クリーンアーキテクチャの段階導入

1. 現在の Controller / Service / Repository で、用語・業務ルール・認証・認可・transaction を実装し、API テストで確認する。
2. 実装した操作の一部に Entity や Value Object を導入し、関連する業務ルールをモデルにまとめる。ドメインモデルは NestJS、Prisma、Supabase SDK、HTTP DTO に依存させない。
3. 同じ操作に UseCase と Repository interface、外部サービスの窓口を導入する。Domain / Application / Infrastructure / Presentation の責務を分け、内側の Domain / Application が外側の実装を参照せず、NestJS の Module で実装を結び付ける。

- 1つの操作で「ルールを理解する → モデルにする → 依存を整理する」と進める。各段階の目的と変更理由を説明し、ユーザーが指定した範囲で実装する。
- Service から UseCase への移行は対象操作ごとに行い、その操作の処理を担当する場所を明確にする。
- クリーンアーキテクチャに移行した操作では、業務上の失敗を内側のエラーとして表し、HTTP 側で status に変換する。Prisma・外部 SDK 固有の型やエラーは外側で扱う。
- 集約やモデルの境界は、守る業務ルールと整合性の範囲をもとに必要な時点で設計する。
- 機能追加と構成の移行は、それぞれ確認しやすい PR に分ける。移行では既存 API の契約・認証・認可・transaction の整合性を保持する。

### Frontend

Frontend は Next.js App Router を使う。`page.tsx` と `layout.tsx` は Server Component を基本とし、操作が必要な末端だけを Client Component にする。shadcn/ui を土台にし、再利用する UI は Storybook で確認する。

## 実装・検証

- 1回の変更は、原則として 1 endpoint または 1 UI 操作に絞る。
- DB変更は Prisma migration に残し、`.env` を commit しない。
- Frontend の操作は Vitest + React Testing Library、Backend API は Vitest + Supertest、主要導線は Playwright で確認する。
- 導入したドメインモデルの業務ルールは Vitest の単体テストで確認する。構成の移行時は既存の API E2E で HTTP 応答と DB への保存・認証・認可を確認する。
- PostgreSQL は Docker Compose で起動する。初期は Next.js / NestJS をローカル開発サーバーとして起動する。
- `pre-commit` は Husky + lint-staged でフォーマット・lint を確認する。全テスト・typecheck・build は PR 前または CI で実行する。
- 変更前に関連 docs を読み、変更後は対象に見合う最小の lint、typecheck、テストを実行する。

## 変更管理

- 個人向けの学習メモ、詰まり対応、作業履歴、ToDo、調査レポートは `docs/local/` に置き、Git 管理しない。正式仕様・アーキテクチャ・共通コマンドは公開する docs に残す。
- 作業を再開するときは、`docs/local/DEVELOPMENT_PROGRESS.md` と `docs/local/QUALITY_SECURITY_FOLLOW_UP_TASKS.md` が存在すれば確認し、未着手タスクと直近の合意を引き継ぐ。正式仕様との食い違いは実装前に示す。
- ユーザーの変更を保持し、無関係なリファクタリングや依存追加をしない。
- 仕様と実装が矛盾する場合は、推測で実装せず差分を示す。
- 大きな設計変更、認証、権限、migration、外部サービス連携は、影響と確認方法を先に明確にする。

## エージェント運用

- 通常は親エージェントが計画・実装・統合を行う。小さな変更を不要に分割しない。
- 子エージェントを使う場合は、対象・受け入れ条件・編集範囲・必要な docs・確認コマンドを絞る。
- Frontend、Backend、テストなど、同じファイルを編集しない独立作業だけを分ける。
- 子の完了報告は、変更ファイル、判断、検証、残るリスクを短くまとめる。

### 推奨モデル

| 役割                  | model / effort       | 主な用途                          |
| --------------------- | -------------------- | --------------------------------- |
| Parent / integration  | GPT-6.1 Sol / high   | 計画、仕様判断、統合、最終確認    |
| Frontend / Backend    | GPT-6.1 Terra / high | Next.js、NestJS、Prisma の実装    |
| Unit / component test | GPT-6 Luna / high    | Vitest の局所テスト               |
| Integration / E2E     | GPT-6.1 Terra / high | Supertest、PostgreSQL、Playwright |
| Architecture review   | GPT-6.1 Sol / high   | 設計・認可・migration の確認      |

### GPT-6 Astra の利用条件

まず GPT-6.1 Sol / high で、論点を限定して調査・review・障害解析する。Astra は、Sol でも安全な結論が出ない場合に限る。

- 対象は、未解決の認可・セキュリティ・transaction・migration・複数層にまたがる再現困難な障害である。
- routine CRUD、UI調整、通常のコードレビューには使わない。
- Astra へ渡す時は Sol の調査結果、実施済み検証、未解決の質問だけを共有する。
- 利用可能か確認できない場合は残量を推測しない。使えなければ Sol で継続する。
