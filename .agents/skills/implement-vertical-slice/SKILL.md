---
name: implement-vertical-slice
description: Bluemine の機能を、必要な REST API・UI・テストの境界をまたいで実装する。環境構築や1ファイルだけの修正ではなく、完結した小さな機能に使う。
---

# 垂直スライスを実装する

`AGENTS.md` と、`docs/DOMAIN_MODEL.md`、`docs/UI_API.md`、`docs/ARCHITECTURE.md` の関連箇所だけを読む。編集前に、要求された振る舞い、API 契約、認可ルール、受け入れ条件を明示する。

機能に必要なレイヤーだけを実装する。

- NestJS のコードは `Controller -> Service -> Repository -> PrismaService` の順序を守る。
- HTTP への変換は Controller、処理の流れと認可は Service、Prisma query は Repository に置く。
- API 入力には DTO のバリデーションを追加する。
- Next.js の page は薄く保ち、操作を伴う振る舞いは目的を絞った Client Component に置く。
- shadcn/ui を使い、該当する場合はアクセシビリティ、モバイルレイアウト、loading・empty・error の状態を維持する。
- UI が操作を隠していても、Backend で認可を検証する。

編集中は対象を絞った確認を実行する。引き渡し前に、影響する lint、型チェック、テストを実行する。変更ファイル、判断、実行コマンドと結果、未確認の境界を報告する。
